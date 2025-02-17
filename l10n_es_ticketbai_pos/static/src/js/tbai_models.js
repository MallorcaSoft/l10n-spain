/* Copyright 2021 Binovo IT Human Project SL
   Copyright 2022 Landoo Sistemas de Informacion SL
   Copyright 2022 Advanced Programming Solu SL
   License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl).
*/

odoo.define("l10n_es_ticketbai_pos.tbai_models", function (require) {
    "use strict";

    var core = require("web.core");
    var _t = core._t;
    var field_utils = require("web.field_utils");

    var Backbone = window.Backbone;
    var tbai = window.tbai;
    var QRCode = window.QRCode;

    /* A TicketBAI Simplified Invoice represents a customer's order
    to be exported to the Tax Agency.
    */
    var TicketBAISimplifiedInvoice = Backbone.Model.extend({
        initialize: function (attributes, options) {
            Backbone.Model.prototype.initialize.apply(this, arguments);
            var opts = options || {};
            this.pos = opts.pos;
            this.previous_tbai_invoice = null;
            this.order = opts.order || null;
            this.number = opts.number || null;
            this.number_prefix = opts.number_prefix || null;
            this.expedition_date = opts.expedition_date || null;
            this.signature_value = opts.signature_value || null;
            this.tbai_identifier = opts.tbai_identifier || null;
            this.tbai_qr_src = opts.tbai_qr_src || null;
            this.tbai_qr_url = null;
            this.vat_regime_key = "01";
            this.vat_regime_key2 = null;
            this.vat_regime_key3 = null;
            this.unsigned_datas = null;
            this.datas = null;
        },

        // Tested on Epson TM-20II
        // 164 (default pixels with margin '0') * 35 (required QR image width in mm) / 22 (default width in mm) = 260
        // Pixels. 255 is the maximum.
        qr_options: {
            margin: 0,
            width: 255,
        },

        build_invoice: function () {
            var self = this;
            var built = new $.Deferred();
            var options = {};
            var deviceId = this.pos.config.tbai_device_serial_number || null;
            // Addon l10n_es_pos -> Order.export_as_JSON()
            var simplified_invoice = null;
            var tbai_json = null;
            this.previous_tbai_invoice = this.pos.get_tbai_last_invoice_data();
            this.expedition_date = new Date();
            if (!this.pos.config.pos_sequence_by_device) {
                this.number_prefix = this.pos.config.l10n_es_simplified_invoice_prefix;
                simplified_invoice =
                    this.order.simplified_invoice ||
                    this.number_prefix +
                        this.pos.get_padding_simple_inv(
                            this.pos.config.l10n_es_simplified_invoice_number,
                            this.pos.config.l10n_es_simplified_invoice_padding
                        );
            } else {
                this.number_prefix =
                    this.pos.get_device().device_simplified_invoice_prefix;
                simplified_invoice =
                    this.number_prefix +
                    this.pos.get_padding_simple_inv(
                        this.pos.get_device().device_simplified_invoice_number,
                        this.pos.get_device().device_simplified_invoice_padding
                    );
            }
            this.number = simplified_invoice.slice(this.number_prefix.length);

            if (this.order.fiscal_position) {
                var tbai_vat_regime_key =
                    this.order.fiscal_position.tbai_vat_regime_key;
                if (tbai_vat_regime_key) {
                    var id_vat_regime_key =
                        this.order.fiscal_position.tbai_vat_regime_key[0];
                    var object_vat_regime_key = self.pos.tbai_vat_regime_keys.find(
                        (x) => x.id === id_vat_regime_key
                    );
                    this.vat_regime_key = object_vat_regime_key.code;
                }
                var tbai_vat_regime_key2 =
                    this.order.fiscal_position.tbai_vat_regime_key2;
                if (tbai_vat_regime_key2) {
                    var id_vat_regime_key =
                        this.order.fiscal_position.tbai_vat_regime_key2[0];
                    var object_vat_regime_key = self.pos.tbai_vat_regime_keys.find(
                        (x) => x.id === id_vat_regime_key
                    );
                    this.vat_regime_key2 = object_vat_regime_key.code;
                }
                var tbai_vat_regime_key3 =
                    this.order.fiscal_position.tbai_vat_regime_key3;
                if (tbai_vat_regime_key3) {
                    var id_vat_regime_key =
                        this.order.fiscal_position.tbai_vat_regime_key3[0];
                    var object_vat_regime_key = self.pos.tbai_vat_regime_keys.find(
                        (x) => x.id === id_vat_regime_key
                    );
                    this.vat_regime_key3 = object_vat_regime_key.code;
                }
            }

            tbai_json = this.export_as_JSON();
            if (!_.isEmpty(tbai_json) && this.pos.tbai_signer !== null) {
                if (typeof deviceId === "string" || deviceId instanceof String) {
                    options.deviceId = deviceId;
                }
                try {
                    this.unsigned_datas = tbai.toXml(
                        tbai_json.Invoice,
                        tbai_json.PreviousInvoiceId || null,
                        tbai_json.Software,
                        options
                    );
                    this.pos.tbai_signer.sign(this.unsigned_datas).then(
                        function (datas) {
                            self.datas = datas;
                            self.signature_value = tbai.getTbaiChainInfo(datas).hash;
                            self.tbai_identifier = tbai.getTbaiId(datas);
                            self.tbai_qr_url = tbai.getTbaiUrlFromBaseURL(
                                datas,
                                self.pos.tbai_qr_base_url
                            );
                            QRCode.toDataURL(self.tbai_qr_url, self.qr_options).then(
                                function (src) {
                                    self.tbai_qr_src = src;
                                    built.resolve();
                                },
                                function (err) {
                                    throw new Error(err);
                                }
                            );
                        },
                        function (err) {
                            throw new Error(err);
                        }
                    );
                } catch (e) {
                    console.error(e);
                    this.showPopup("ErrorPopup", {
                        title: _t("TicketBAI"),
                        body: e.message,
                    });
                    built.reject();
                }
            } else {
                built.reject();
            }
            return built;
        },
        get_vat_without_country_code: function (vat, country_code) {
            var vat_without_country_code = null;
            var vat_upper = vat.toUpperCase();
            var country_code_upper = country_code ? country_code.toUpperCase() : null;
            if (
                country_code_upper &&
                vat_upper.slice(0, country_code_upper.length) === country_code_upper
            ) {
                vat_without_country_code = vat_upper.slice(country_code_upper.length);
            } else {
                vat_without_country_code = vat_upper;
            }
            return vat_without_country_code;
        },
        get_tbai_company_vat: function () {
            var company = this.pos.company;
            return this.get_vat_without_country_code(company.vat, company.country.code);
        },
        get_tbai_partner_vat: function (partner_id) {
            var partner = this.pos.db.get_partner_by_id(partner_id);
            var country_code = this.pos.get_country_code_by_id(partner.country_id[0]);
            if (country_code === "ES" || partner.tbai_partner_idtype === "02") {
                return this.get_vat_without_country_code(partner.vat, country_code);
            }
            return partner.tbai_partner_identification_number;
        },
        export_as_JSON: function () {
            var order_json =
                (this.order !== null && this.order.export_as_JSON()) || null;
            var tbai_json = {};
            var company = this.pos.company;
            var vat_keys = [this.vat_regime_key];
            var self = this;
            var simplified = "N";

            if (
                order_json !== null &&
                this.number !== null &&
                this.expedition_date !== null
            ) {
                if (this.vat_regime_key2 !== null) {
                    vat_keys.push(this.vat_regime_key2);
                }
                if (this.vat_regime_key3 !== null) {
                    vat_keys.push(this.vat_regime_key3);
                }
                if (company.tbai_vat_regime_simplified) {
                    simplified = "S";
                }
                tbai_json.Invoice = {
                    simple: true,
                    issuer: {
                        irsId: this.get_tbai_company_vat(),
                        name: company.name,
                    },
                    id: {
                        number: this.number,
                        serie: this.number_prefix,
                        issuedTime: this.expedition_date,
                    },
                    description: {
                        text: order_json.name,
                        operationDate: this.expedition_date,
                    },
                    lines: this.get_tbai_lines_from_json(order_json.lines),
                    total: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(order_json.amount_total)
                    ),
                    vatKeys: vat_keys,
                    simplified: simplified,
                };
                tbai_json.Invoice.vatLines =
                    this.get_tbai_vat_lines_from_json(order_json);
                if (order_json.partner_id) {
                    var partner = this.pos.db.get_partner_by_id(order_json.partner_id);
                    var zip = partner.zip;
                    var address =
                        (partner.street || "") +
                        ", " +
                        (partner.zip || "") +
                        " " +
                        (partner.city || "") +
                        ", " +
                        (partner.country_id[1] || "");
                    tbai_json.Invoice.recipient = {
                        irsId: this.get_tbai_partner_vat(order_json.partner_id),
                        name: partner.name,
                        postal: zip,
                        address: address,
                    };
                }
                if (this.previous_tbai_invoice !== null) {
                    tbai_json.PreviousInvoiceId = {
                        number: this.previous_tbai_invoice.number,
                        serie: this.previous_tbai_invoice.number_prefix,
                        issuedTime: new Date(
                            JSON.parse(
                                JSON.stringify(
                                    this.previous_tbai_invoice.expedition_date
                                )
                            )
                        ),
                        hash: this.previous_tbai_invoice.signature_value.substring(
                            0,
                            100
                        ),
                    };
                }
                tbai_json.Software = {
                    license: company.tbai_license_key,
                    developerIrsId: this.get_tbai_partner_vat(
                        company.tbai_developer_id[0]
                    ),
                    name: company.tbai_software_name,
                    version: company.tbai_software_version,
                };
            }
            return tbai_json;
        },
        get_tbai_lines_from_json: function (lines_json) {
            var lines = [];
            var line = null;
            var company = this.pos.company;
            var description_line = null;
            var self = this;
            lines_json.forEach(function (item) {
                line = item[2];
                description_line = line.tbai_description.substring(0, 250);
                if (company.tbai_protected_data && company.tbai_protected_data_txt) {
                    description_line = company.tbai_protected_data_txt.substring(
                        0,
                        250
                    );
                }
                lines.push({
                    description: description_line,
                    quantity: line.qty,
                    price: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(line.tbai_price_unit)
                    ),
                    discount: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(line.discount)
                    ),
                    discountAmount: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(
                            (line.qty * line.tbai_price_unit * line.discount) / 100.0
                        )
                    ),
                    vat: line.tbai_vat_amount,
                    amount: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(line.tbai_price_without_tax)
                    ),
                    amountWithVat: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(line.tbai_price_with_tax)
                    ),
                });
            });
            return lines;
        },
        get_tbai_vat_lines_from_json: function (order_json) {
            var vatLines = [];
            var vatLinesJson = order_json.taxLines;
            var self = this;
            if (vatLinesJson && vatLinesJson.length > 0) {
                vatLinesJson.forEach(function (vatLineJson) {
                    var vatLine = vatLineJson[2];
                    vatLines.push({
                        base: field_utils.parse.float(
                            self.pos.format_currency_no_symbol(vatLine.baseAmount)
                        ),
                        rate: vatLine.tax.amount,
                        amount: field_utils.parse.float(
                            self.pos.format_currency_no_symbol(vatLine.amount)
                        ),
                    });
                });
            } else {
                var fline = order_json.lines[0][2];
                vatLines.push({
                    base: field_utils.parse.float(
                        self.pos.format_currency_no_symbol(order_json.amount_total)
                    ),
                    rate: fline.tbai_vat_amount,
                    amount: 0,
                });
            }
            return vatLines;
        },
    });

    return {
        TicketBAISimplifiedInvoice: TicketBAISimplifiedInvoice,
    };
});

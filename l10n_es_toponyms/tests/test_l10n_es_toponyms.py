# Copyright 2013-2021 Tecnativa - Pedro M. Baeza
# License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl.html).

from odoo.tests import common


class TestL10nEsToponyms(common.TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env = cls.env(
            context=dict(
                cls.env.context,
                mail_create_nolog=True,
                mail_create_nosubscribe=True,
                mail_notrack=True,
                no_reset_password=True,
                tracking_disable=True,
            )
        )
        cls.wizard = cls.env["config.es.toponyms"].create({"name": ""})

    def test_import(self):
        self.wizard.with_context(max_import=10).execute()
        cities = self.env["res.city"].search(
            [("country_id", "=", self.env.ref("base.es").id)]
        )
        self.assertTrue(cities)
        self.assertTrue(cities.mapped("zip_ids"))

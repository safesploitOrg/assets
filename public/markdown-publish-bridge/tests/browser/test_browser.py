"""Manual-only Playwright checks; intentionally NOT invoked by GitHub Actions CI.

Run: npm run test:browser
Optional: BRIDGE_BROWSER=firefox npm run test:browser
Requires: pip install playwright && python -m playwright install chromium
"""

import functools
import os
import shutil
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

PUBLIC = Path(__file__).resolve().parents[2] / 'public'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format_string, *args):
        pass


class BrowserJourneys(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(PUBLIC))
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.playwright = sync_playwright().start()
        browser_name = os.environ.get('BRIDGE_BROWSER', 'chromium').lower()
        if browser_name not in ('chromium', 'firefox', 'webkit'):
            raise ValueError('BRIDGE_BROWSER must be chromium, firefox or webkit')
        kwargs = {'headless': True}
        if browser_name == 'chromium':
            system_browser = shutil.which('chromium') or shutil.which('google-chrome')
            if system_browser:
                kwargs['executable_path'] = system_browser
                kwargs['args'] = ['--no-sandbox']
        cls.browser = getattr(cls.playwright, browser_name).launch(**kwargs)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.base_url, wait_until='load')

    def tearDown(self):
        self.assertEqual(self.errors, [], 'Browser JavaScript should not throw')
        self.context.close()

    def test_example_platform_switch_and_keyboard_tabs(self):
        self.page.locator('#demoButton').click()
        self.assertIn('published: false', self.page.locator('#outputMarkdown').input_value())
        self.assertIn('tier0-network.png', self.page.locator('#outputMarkdown').input_value())
        self.page.locator('#tabHf').click()
        self.assertNotIn('published: false', self.page.locator('#outputMarkdown').input_value())
        self.assertIn('Securing Tier 0 Administration', self.page.locator('#hfTitle').inner_text())
        self.assertEqual(self.page.locator('#tabHf').get_attribute('aria-selected'), 'true')
        self.page.locator('#tabHf').press('ArrowLeft')
        self.assertEqual(self.page.locator('#tabDev').get_attribute('aria-selected'), 'true')
        self.assertIn('published: false', self.page.locator('#outputMarkdown').input_value())

    def test_untrusted_input_remains_text_not_executable(self):
        self.page.locator('#sourceMarkdown').fill('# A title\n\n<script>window.__markdownXss = true</script>')
        self.page.wait_for_timeout(180)
        self.assertIn('<script>window.__markdownXss', self.page.locator('#outputMarkdown').input_value())
        self.assertFalse(self.page.evaluate('Boolean(window.__markdownXss)'))
        self.assertIn('unsafe', self.page.locator('#diagnostics').inner_text().lower())

    def test_file_import_and_accessible_focus(self):
        self.page.locator('#fileInput').set_input_files({
            'name': 'sample.md', 'mimeType': 'text/markdown', 'buffer': b'# Imported file\n\nThis is a sample.'
        })
        self.assertIn('Imported file', self.page.locator('#outputMarkdown').input_value())
        self.page.locator('#fileInput').focus()
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'fileInput')
        self.page.locator('#clearButton').click()
        self.assertEqual(self.page.locator('#outputMarkdown').input_value(), '')

    def test_mobile_tablet_desktop_without_document_overflow(self):
        for width, height in ((390, 844), (768, 1024), (1440, 900)):
            self.page.set_viewport_size({'width': width, 'height': height})
            self.page.locator('#demoButton').click()
            self.assertTrue(self.page.locator('#copyOutput').is_enabled())
            document_width = self.page.evaluate('document.documentElement.scrollWidth')
            self.assertLessEqual(document_width, width + 1, f'Unexpected page overflow at {width}px')

    def test_csp_denies_unapproved_network_origins(self):
        result = self.page.evaluate('''async () => {
          try { await fetch('https://example.com/leak', {mode: 'cors'}); return 'allowed'; }
          catch (_) { return 'blocked'; }
        }''')
        self.assertEqual(result, 'blocked')


if __name__ == '__main__':
    unittest.main()

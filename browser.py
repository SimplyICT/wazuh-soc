#!/usr/bin/env python3
"""Launch Playwright browser for SOC dashboard interaction."""
import os
import sys

os.environ['LD_LIBRARY_PATH'] = '/home/aiagent/.local/lib'

from playwright.sync_api import sync_playwright

def main():
    url = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SOC_SERVER_URL", "http://208.87.135.84:8095/soc/")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--no-sandbox'])
        page = browser.new_page()
        page.goto(url)
        print(f'Opened: {page.title()}')
        
        # Keep the browser open
        input('Press Enter to close browser...')
        browser.close()

if __name__ == '__main__':
    main()

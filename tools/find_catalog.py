import urllib.request
import urllib.parse
import re
import json

query = 'Microsoft Edge WebView2 Runtime 109.0.1518'
url = 'https://www.catalog.update.microsoft.com/Search.aspx?q=' + urllib.parse.quote(query)
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

req = urllib.request.Request(url, headers=headers)
html = urllib.request.urlopen(req).read().decode('utf-8')

# Find download dialog links
matches = re.findall(r'goToDetails\("([^"]+)"\)[^>]*>([^<]+)</a>', html)
print(f"Matches count: {len(matches)}")
for u_id, title in matches:
    print(f"Title: {title.strip()} | ID: {u_id}")

# Find button inputs with id matching updateID_download
buttons = re.findall(r'id="([a-f0-9\-]+)_link"[^>]*onclick="goToDetails\([^\)]+\)', html)
download_ids = re.findall(r'goToDownloadDialog\("([^"]+)"\)', html)
print(f"Download IDs: {download_ids}")

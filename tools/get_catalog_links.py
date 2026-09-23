import urllib.request
import urllib.parse
import json
import re

update_ids = [
    "cd7a382c-62c6-46c0-8098-0d50a7953b61",
    "b66cfe87-928e-4647-afe2-36254a55f53e",
    "322eb0af-cdbc-4a17-a8ca-f0ace4d4adc8",
    "7eb83de1-df3a-4277-9b2d-234b2f536ca6",
    "e9eaf84c-f27f-4e18-93ef-af3491de2ea7",
    "31261b07-d234-4b09-a9cb-0b360797ca4c"
]

dialog_url = "https://www.catalog.update.microsoft.com/DownloadDialog.aspx"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Content-Type': 'application/x-www-form-urlencoded'
}

for uid in update_ids:
    payload = json.dumps([{"size": 0, "languages": "", "uidInfo": uid, "updateID": uid}])
    data = urllib.parse.urlencode({'updateIDs': payload}).encode('utf-8')
    req = urllib.request.Request(dialog_url, data=data, headers=headers)
    try:
        resp = urllib.request.urlopen(req).read().decode('utf-8')
        links = re.findall(r'downloadInformation\[[0-9]+\]\.files\[[0-9]+\]\.url\s*=\s*[\'\"]([^\'\"]+)[\'\"]', resp)
        titles = re.findall(r'downloadInformation\[[0-9]+\]\.title\s*=\s*[\'\"]([^\'\"]+)[\'\"]', resp)
        print(f"\n--- UID: {uid} ---")
        if titles:
            print("Title:", titles[0])
        for l in links:
            print("Download URL:", l)
    except Exception as e:
        print("Error for UID:", uid, e)

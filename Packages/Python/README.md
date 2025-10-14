# 🧩 Python — NovaCore LicenseCheck

NovaCore LicenseCheck is a lightweight module or CLI utility for license verification.  
It handles all Phantom API response formats and allows silent or embedded use.

---

## 🧠 Features
- ✅ Phantom Licenses API compatible  
- 🧾 POST verification using header `LICENSE_KEY`  
- 🔁 Auto-retry with JSON body on HTTP 500  
- 🧩 Skip logic for optional fields (`discord_id`, `product.name`)  
- 🧮 Deterministic exit codes (0–5) for automation

---

## ⚙ Implementation

### Dependencies
- Python **3.8+**
- `requests` package [*Auto Installed*]

```bash
pip install novacore
```

### Code
```python
from novacore import login, login_silent, login_noexit
import sys

# Call LicenseCheck normally (config file at config/config.json)
try:
    login()
except Exception as e:
    print("Something went wrong, Here's a preview for developers:"+"\n"+e)
    sys.exit(1)

# Call LicenseCheck silently so user doesn't know it's called unless Mismatches found (config file at config/config.json)
try:
    login_silent()
except Exception as e:
    print("Something went wrong, Here's a preview for developers:"+"\n"+e)
    sys.exit(1)

# Call LicenseCheck with no exit so even if any mismatches are found user does/can see logs but program is not exitted (config file at config/config.json)
try:   
    login_noexit()
except Exception as e:
    print("Something went wrong, Here's a preview for developers:"+"\n"+e)
    sys.exit(1)





# If you want to get license info from a json file not located at config/config.json but rather located at "path" then use
login(path)
login_noexit(path)
login_silent(path)  


# It will exit (not the noexit one) if mismatches found and will continue running normally if not
```

### Config

```json
{
  "license": {
    "url": "https://your_domain/api/license",
    "key": "license_key",
    "discord_id": "discord_ID___optional",
    "product_name": "product_name___optional"
  }
}
```

---

## 💡 Exit Codes
**Code** - **Meaning**
- 0	- ✅ Success
- 2 - ⚙️ Config error
- 3 - 🌐 API/network error
- 4 - ❌ Mismatch(es) found
- 5 - 🔑 Invalid license key

---
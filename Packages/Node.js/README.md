# 🧩 Node.js — NovaCore LicenseCheck

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
- Node.js 18+

```bash
npm install @vedustorm/novacore
```

### Code
```javascript
import { login, login_silent, login_noexit } from "./license.js";

try {
    await login();
    // This does print the brief summary of LicenseCheck, no matter if mismatch occurs or not
  } catch (e) {
    console.error("Unexpected error:", e);
    process.exit(1);
}


try {
    await login_silent();
    // This doesn't print anything on successful check but if mismatch occurs it print what was mismatching
  } catch (e) {
    console.error("Unexpected error:", e);
    process.exit(1);
}

try {
    await login_noexit();
    // This prints summary; if mismatches exist, it does NOT exit.
  } catch (e) {
    console.error("Unexpected error:", e);
    process.exit(1);
}

// If you want to get license info from a json file not located at config/config.json but rather located at "path" then use
try{
    await login(path)
    await login_noexit(path)
    await login_silent(path)
} catch (e) {
    console.error("Unexpected error:", e);
    process.exit(1);
}

// It will exit (not the noexit one) if mismatches found and will continue running normally if not
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
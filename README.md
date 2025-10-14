# 🌌 NovaCore LicenseCheck — Phantom Licenses Compatible

NovaCore LicenseCheck is a cross-language (Python + JavaScript ESM) utility for verifying and validating licenses against a **Phantom Licenses-compatible API**.  
It provides **robust error handling**, **skip-check logic**, and **deterministic exit codes** — perfect for automation and CI/CD pipelines.

---

## 🧭 Quick Navigation
- [🧩 Python Implementation](Implement/Python/README.md)
- [⚡ Node.js (ESM) Implementation](Implement/Node.js/README.md)
- [🧩 Python Module](https://pypi.org/project/novacore/)
- [⚡ Node.js (ESM) Package](https://www.npmjs.com/package/@vedustorm/novacore)
---

## ⚙️ Overview

NovaCore LicenseCheck is designed to:
- Communicate with Phantom-compatible license APIs.
- Verify fields like `customer.discord_id`, and `product.name`.
- Handle `null` or missing values gracefully via skip-check logic.
- Provide human-readable summaries and machine-friendly exit codes.

### 🧠 Features
- ✅ Phantom Licenses API compatible  
- 🧾 POST verification using header `LICENSE_KEY`  
- 🔁 Auto-retry with JSON body on HTTP 500  
- 🧩 Skip logic for optional fields (`discord_id`, `product.name`)  
- 🧮 Deterministic exit codes (0–5) for automation

### Names of Packages
- novacore `pip install novacore` [Python]
- @vedustorm/novacore `npm install @vedustorm/novacore` [Node.js]

Both implementations support:
- **Unified 404 → INVALID_LICENSE_KEY normalization**
- **Retry logic** for HTTP 500 (header-based → JSON body)
- **Configurable checks** and clear output for CI/CD
---
## License
This source is Licensed under [Mozilla Public License 2.0](LICENSE)
---
## Contributing
READ [CODE OF CONDUCT](CODE_OF_CONDUCT.md) and follow [Contributing Guidelines](CONTRIBUTING_GUIDELINES.md)

- If you don't know how to contribute check out this [Repository](https://github.com/firstcontributions/first-contributions)
---

## Contact Me
- [Discord](https://discord.com/users/1104705926558130207) || cool.guy_57
- [Email](mailto:vedant.storm@gmail.com) || vedant.storm@gmail.com

- Open to Contribution

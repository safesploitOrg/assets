---
title: "Securing Tier 0 Administration with a Bastion"
description: "A practical approach to privilege isolation in a one-device environment."
tags: [security, devops, windows]
series: "Practical Active Directory Hardening"
---

# Securing Tier 0 Administration with a Bastion

> [!WARNING]
> Logical isolation through a bastion is not the same as a dedicated, trusted PAW.

## Network architecture

![Tier 0 access flow](./assets/tier0-network.png)

Related documentation: [Admin account tiers](../identity/admin-accounts.md).

```powershell
# Preserve any literal Markdown inside code blocks:
Write-Output "![diagram](./literal.png)"
```

<details>
<summary>Validation checklist</summary>

Verify firewall rules, MFA, logon restrictions, and audit events before production.

</details>

# Assets

Central media repository for reusable GitHub assets, including README images, screenshots, banners, diagrams, and logos.

This repository is intended for public-safe media that may be referenced across multiple repositories for safesploitOrg.

## Structure

```text
.
├── README.md
└── repo/
    ├── PassFabricator/
    │   └── media/
    │       ├── banners/
    │       ├── screenshots/
    │       ├── diagrams/
    │       └── logos/
    └── homelab/
        └── media/
            ├── banners/
            ├── screenshots/
            ├── diagrams/
            └── logos/
```

## Usage

Reference assets in Markdown using the raw GitHub URL:

```md
![Alt text](https://raw.githubusercontent.com/<owner>/<media-repo>/main/repo/<project>/media/<type>/<filename>)
```

Example:

```md
![PassFabricator Screenshot](https://raw.githubusercontent.com/<owner>/<media-repo>/main/repo/PassFabricator/media/screenshots/passfabricator-demo.png)
```

## Naming Convention

Use lowercase, hyphen-separated filenames:

```text
passfabricator-demo.png
homelab-network-diagram.png
proxmox-dashboard.png
```

Avoid vague or temporary names:

```text
image1.png
final-final.png
screenshot-new.png
```

## Guidelines

- Store only public-safe media.
- Redact hostnames, IP addresses, usernames, tokens, secrets, and internal identifiers.
- Keep paths stable once referenced externally.
- Replace assets in place where possible to avoid broken README links.
- Use project-specific folders under `repo/` for organisation.

## Recommended Use

Use this repository for shared or reusable assets.

For images only used by a single project, consider keeping them in that project under:

```text
docs/images/
```

## Licence

Unless otherwise stated, all assets in this repository are owned by the repository owner.

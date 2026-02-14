---
name: grimoire:readme-guide
description: "Create and review README files following industry best practices. Use for writing new READMEs, improving existing ones, checking README quality, or adding badges. Triggers: readme, documentation, project docs, repository documentation, getting started guide, shields badges."
user_invocable: true
disable-model-invocation: false
---

# README Guide

Create professional README files that help users understand, install, and use your project. This skill synthesizes best practices from [Make a README](https://www.makeareadme.com/), [Standard Readme](https://github.com/RichardLitt/standard-readme), [Google's Style Guide](https://google.github.io/styleguide/docguide/READMEs.html), and community standards.

## Capabilities

- **Create READMEs**: Generate complete README files for any project type
- **Review READMEs**: Analyze existing READMEs against best practices
- **Section guidance**: Recommend sections based on project type
- **Badge selection**: Suggest appropriate badges using Shields.io
- **Format optimization**: Ensure proper markdown structure

## File Requirements

Per [Google's Style Guide](https://google.github.io/styleguide/docguide/READMEs.html):
- File must be named `README.md` (case-sensitive)
- Place in top-level directory of your codebase
- Every package directory should have an up-to-date README

## Section Structure

Based on [Standard Readme specification](https://github.com/RichardLitt/standard-readme/blob/main/spec.md), sections must appear in this order:

### Required Sections

| Section | Requirements |
|---------|-------------|
| **Title** | Must match repository/package name |
| **Description** | 1-3 sentences, under 120 characters for short version |
| **Installation** | Code block showing install command |
| **Usage** | Basic example with expected output |
| **License** | SPDX identifier, owner, link to LICENSE file |

### Recommended Sections

| Section | When to Include |
|---------|-----------------|
| **Badges** | Always for public projects |
| **Table of Contents** | Required if README exceeds 100 lines |
| **Features/Highlights** | When project has multiple capabilities |
| **Prerequisites** | When dependencies exist beyond package manager |
| **Configuration** | When env vars or config files needed |
| **API Reference** | For libraries, or link to full docs |
| **Contributing** | For open source projects |
| **Changelog** | Link to CHANGELOG.md |
| **Acknowledgments** | Credits for contributors, inspiration |

## How to Use

### Creating a New README

1. **Provide project details**:
   - Project name and purpose
   - Target audience
   - Language/framework
   - Installation method
   - Basic usage example

2. **I'll generate a README with**:
   - Appropriate sections for your project type
   - Proper markdown formatting
   - Placeholder badges you can customize
   - Code blocks with syntax highlighting

### Reviewing an Existing README

1. Share your README content or file path
2. I'll analyze against this checklist:
   - [ ] Clear, accurate title matching repo name
   - [ ] Description explains what AND why
   - [ ] Installation instructions are complete
   - [ ] Usage example is runnable
   - [ ] All code examples tested
   - [ ] License specified
   - [ ] Links all work
   - [ ] No placeholder text remaining
   - [ ] TOC present if >100 lines

## Badge Guidelines

Based on [Shields.io best practices](https://daily.dev/blog/readme-badges-github-best-practices):

### Quantity & Placement
- Use **2-4 key badges** at top of README
- Place less critical badges lower or in tables
- Avoid "badge saturation"

### Recommended Badges

```markdown
[![Build Status](https://github.com/USER/REPO/actions/workflows/ci.yml/badge.svg)](...)
[![Coverage](https://codecov.io/gh/USER/REPO/branch/main/graph/badge.svg)](...)
[![npm version](https://img.shields.io/npm/v/PACKAGE.svg)](...)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

### Badge Categories

| Category | Examples |
|----------|----------|
| **CI/Build** | GitHub Actions, CircleCI, Travis |
| **Quality** | Codecov, Code Climate, SonarCloud |
| **Package** | npm, PyPI, crates.io version |
| **License** | MIT, Apache 2.0, GPL |
| **Activity** | Last commit, contributors, stars |

### Best Practices
- Get all badges from [Shields.io](https://shields.io/) for consistent styling
- Keep badges current and accurate
- Remove badges when they no longer apply
- Use GitHub Actions to auto-update badges

## Project-Type Templates

### Library/Package

```markdown
# package-name

[![CI](https://github.com/user/repo/actions/workflows/ci.yml/badge.svg)](...)
[![npm](https://img.shields.io/npm/v/package-name.svg)](...)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Brief description of what this library does.

## Installation

npm install package-name

## Usage

import { feature } from 'package-name';

const result = feature.process(data);
console.log(result);

## API

### `functionName(param: Type): ReturnType`

Description of what it does.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT - see [LICENSE](LICENSE)
```

### CLI Tool

```markdown
# tool-name

One-line description of the CLI.

## Installation

brew install tool-name
# or
npm install -g tool-name

## Usage

tool-name <command> [options]

### Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize new project |
| `build` | Build for production |
| `deploy` | Deploy to server |

### Examples

# Initialize with defaults
tool-name init my-project

# Build with verbose output
tool-name build --verbose

## Configuration

Create `.toolrc` in project root:

{
  "outputDir": "dist",
  "minify": true
}

## License

MIT
```

### Web Application

```markdown
# App Name

Brief description and what problem it solves.

![Screenshot](docs/screenshot.png)

## Features

- Feature one with brief explanation
- Feature two with brief explanation
- Feature three with brief explanation

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

git clone https://github.com/user/repo.git
cd repo
npm install
cp .env.example .env
npm run dev

Open http://localhost:3000

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `JWT_SECRET` | Auth token secret | Yes |
| `PORT` | Server port | No (default: 3000) |

## Deployment

See [deployment guide](docs/deployment.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
```

## Writing Guidelines

### Title & Description

Per [Make a README](https://www.makeareadme.com/):
- Title should be self-explanatory
- Description explains what it does AND provides context
- Keep short description under 120 characters

**Good:**
```markdown
# fast-csv

Fast CSV parser and formatter for Node.js.

Stream-based CSV processing for large datasets without loading everything into memory. Supports custom delimiters, headers, and transformations.
```

**Avoid:**
```markdown
# My Project

A project that does stuff.
```

### Code Examples

- Always use syntax highlighting (```js, ```python)
- Show complete, runnable examples
- Include expected output when helpful
- Start simple, then show advanced usage

### Installation Section

Per [Standard Readme](https://github.com/RichardLitt/standard-readme):
- Show one-liner using relevant package manager
- Include prerequisites if any
- Platform-specific instructions when needed

### Table of Contents

Required when README exceeds 100 lines. Must link to all sections:

```markdown
## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)
```

## Common Mistakes

From [community guidelines](https://tilburgsciencehub.com/topics/collaborate-share/share-your-work/content-creation/readme-best-practices/):

- **Walls of text**: Break up with headers, bullets, spacing
- **Missing install steps**: If someone can't run it, they leave
- **Inconsistent formatting**: Same style for all code blocks
- **Outdated info**: Old scripts/commands cause confusion
- **No formatting**: Raw text looks unprofessional
- **Jumping heading levels**: Don't go from ## to #####

## Key Principles

1. **Lead with value** - Users should understand what they get in 10 seconds
2. **Show, don't tell** - Code examples > descriptions
3. **Test your examples** - Run every code snippet before publishing
4. **Too long > too short** - Link to detailed docs rather than cutting content
5. **Keep it current** - Outdated docs are worse than no docs
6. **Progressive disclosure** - Overview in README, details in linked docs

## Example Usage

**Creating:**
- "Create a README for my Python CLI that converts images to ASCII"
- "I need a README for my React component library"
- "Help me write documentation for my REST API"

**Reviewing:**
- "Review my README and suggest improvements"
- "What sections am I missing?"
- "Is my installation section clear enough?"

**Badges:**
- "What badges should I add to my npm package?"
- "Help me set up CI badges for my GitHub Actions workflow"

## Limitations

- Cannot verify if installation instructions actually work
- Badge URLs require your specific repo/package info
- Cannot auto-generate code examples without understanding your codebase
- Screenshots/GIFs must be provided by you

## Sources

- [Make a README](https://www.makeareadme.com/) - Comprehensive README guide
- [Standard Readme](https://github.com/RichardLitt/standard-readme) - Formal specification
- [Google Style Guide](https://google.github.io/styleguide/docguide/READMEs.html) - Corporate standards
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) - Popular template
- [Shields.io](https://shields.io/) - Badge generation
- [PyOpenSci Guide](https://www.pyopensci.org/python-package-guide/documentation/repository-files/readme-file-best-practices.html) - Python-specific practices

#!/usr/bin/env bash
#
# create-skill.sh - Scaffold a new Claude Code skill with proper structure
#
# Usage: ./create-skill.sh <skill-name> [--template basic|domain]
#
# This script creates a new skill directory with SKILL.md from a template.
# It validates the skill name format and prompts for a description.

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory (for finding templates)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DEVELOPER_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$SKILL_DEVELOPER_DIR/templates"

# Default template
TEMPLATE="basic"

# Parse arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: Skill name required${NC}"
    echo "Usage: $0 <skill-name> [--template basic|domain]"
    echo ""
    echo "Examples:"
    echo "  $0 my-skill"
    echo "  $0 financial-analysis --template domain"
    exit 1
fi

SKILL_NAME="$1"
shift

# Parse optional flags
while [ $# -gt 0 ]; do
    case "$1" in
        --template)
            TEMPLATE="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Error: Unknown argument: $1${NC}"
            exit 1
            ;;
    esac
done

# Validate template option
if [ "$TEMPLATE" != "basic" ] && [ "$TEMPLATE" != "domain" ]; then
    echo -e "${RED}Error: Template must be 'basic' or 'domain'${NC}"
    exit 1
fi

# Validate skill name format
validate_name() {
    local name="$1"

    # Check length
    if [ ${#name} -gt 64 ]; then
        echo -e "${RED}Error: Skill name must be ≤64 characters (got ${#name})${NC}"
        return 1
    fi

    # Check for uppercase letters
    if [[ "$name" =~ [A-Z] ]]; then
        echo -e "${RED}Error: Skill name must be lowercase${NC}"
        return 1
    fi

    # Check for invalid characters (only lowercase, numbers, hyphens allowed)
    if [[ ! "$name" =~ ^[a-z0-9-]+$ ]]; then
        echo -e "${RED}Error: Skill name can only contain lowercase letters, numbers, and hyphens${NC}"
        return 1
    fi

    # Check for reserved words
    if [[ "$name" =~ anthropic|claude ]]; then
        echo -e "${RED}Error: Skill name cannot contain 'anthropic' or 'claude'${NC}"
        return 1
    fi

    # Check if it starts or ends with hyphen
    if [[ "$name" =~ ^- ]] || [[ "$name" =~ -$ ]]; then
        echo -e "${RED}Error: Skill name cannot start or end with hyphen${NC}"
        return 1
    fi

    return 0
}

# Validate the skill name
if ! validate_name "$SKILL_NAME"; then
    echo ""
    echo "Skill name requirements:"
    echo "  - Maximum 64 characters"
    echo "  - Lowercase letters (a-z)"
    echo "  - Numbers (0-9)"
    echo "  - Hyphens (-) as separators"
    echo "  - Cannot contain 'anthropic' or 'claude'"
    echo "  - Cannot start/end with hyphen"
    exit 1
fi

# Determine skill directory (assuming .claude/skills/ structure)
# Search upward for .claude directory
CURRENT_DIR="$(pwd)"
CLAUDE_DIR=""

while [ "$CURRENT_DIR" != "/" ]; do
    if [ -d "$CURRENT_DIR/.claude/skills" ]; then
        CLAUDE_DIR="$CURRENT_DIR/.claude/skills"
        break
    fi
    CURRENT_DIR="$(dirname "$CURRENT_DIR")"
done

if [ -z "$CLAUDE_DIR" ]; then
    # Default to creating in current directory's .claude/skills
    CLAUDE_DIR="$(pwd)/.claude/skills"
    echo -e "${YELLOW}Warning: .claude/skills directory not found, will create at: $CLAUDE_DIR${NC}"
fi

SKILL_DIR="$CLAUDE_DIR/$SKILL_NAME"

# Check if skill already exists
if [ -d "$SKILL_DIR" ]; then
    echo -e "${RED}Error: Skill directory already exists: $SKILL_DIR${NC}"
    exit 1
fi

# Prompt for description
echo ""
echo -e "${GREEN}Creating skill: $SKILL_NAME${NC}"
echo "Template: $TEMPLATE"
echo ""
echo "Enter skill description (max 1024 characters):"
echo "Include WHAT the skill does and WHEN to use it (trigger keywords)"
echo ""
read -p "> " DESCRIPTION

# Validate description
if [ -z "$DESCRIPTION" ]; then
    echo -e "${RED}Error: Description cannot be empty${NC}"
    exit 1
fi

if [ ${#DESCRIPTION} -gt 1024 ]; then
    echo -e "${RED}Error: Description must be ≤1024 characters (got ${#DESCRIPTION})${NC}"
    exit 1
fi

# Create skill directory
echo ""
echo "Creating directory: $SKILL_DIR"
mkdir -p "$SKILL_DIR"

# Load template
TEMPLATE_FILE="$TEMPLATES_DIR/${TEMPLATE}-skill.md"

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${RED}Error: Template file not found: $TEMPLATE_FILE${NC}"
    rm -rf "$SKILL_DIR"
    exit 1
fi

# Read template and replace placeholders
SKILL_CONTENT=$(cat "$TEMPLATE_FILE")

# Extract just the template content (everything from first ``` to last ```)
SKILL_CONTENT=$(echo "$SKILL_CONTENT" | sed -n '/^```yaml$/,/^```$/p' | sed '1d;$d')

# Replace placeholders
SKILL_CONTENT=$(echo "$SKILL_CONTENT" | sed "s/your-skill-name/$SKILL_NAME/g")
SKILL_CONTENT=$(echo "$SKILL_CONTENT" | sed "s|What this skill does and when to use it with trigger keywords|$DESCRIPTION|g")
SKILL_CONTENT=$(echo "$SKILL_CONTENT" | sed "s|domain-specific-skill|$SKILL_NAME|g")
SKILL_CONTENT=$(echo "$SKILL_CONTENT" | sed "s|Domain expertise and capabilities. Use when working with \[domain keywords\]|$DESCRIPTION|g")

# Write SKILL.md
SKILL_FILE="$SKILL_DIR/SKILL.md"
echo "$SKILL_CONTENT" > "$SKILL_FILE"

echo ""
echo -e "${GREEN}✓ Skill created successfully!${NC}"
echo ""
echo "Location: $SKILL_FILE"
echo ""
echo "Next steps:"
echo "  1. Edit $SKILL_FILE to add:"
echo "     - Capabilities"
echo "     - How to Use instructions"
echo "     - Example Usage"
echo "     - Best Practices"
echo "  2. Validate with: $SCRIPT_DIR/validate-skill.py $SKILL_FILE"
echo "  3. Test activation by asking Claude questions matching your keywords"
echo ""

# Optionally open in editor
if command -v code &> /dev/null; then
    read -p "Open in VS Code? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        code "$SKILL_FILE"
    fi
fi

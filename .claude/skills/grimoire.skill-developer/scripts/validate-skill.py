#!/usr/bin/env python3
"""
validate-skill.py - Validate Claude Code skill YAML frontmatter and structure

Usage: ./validate-skill.py <path-to-SKILL.md>

This script validates skill files against official Anthropic requirements:
- YAML frontmatter format
- Name field (length, format, reserved words)
- Description field (length, content)
- Directory name matching
- SKILL.md body size (500 line limit)
- Total skill bundle size (8MB limit)
- Reference file table of contents (>100 lines)
- Reference file linking depth

Exit codes:
  0 - Validation passed
  1 - Validation failed
"""

import sys
import re
import os
from pathlib import Path
from typing import Tuple, List

# ANSI color codes
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
NC = '\033[0m'  # No Color


def error(message):
    """Print error message in red"""
    print(f"{RED}✗ {message}{NC}", file=sys.stderr)


def success(message):
    """Print success message in green"""
    print(f"{GREEN}✓ {message}{NC}")


def warning(message):
    """Print warning message in yellow"""
    print(f"{YELLOW}⚠ {message}{NC}")


def validate_yaml_frontmatter(content):
    """Extract and validate YAML frontmatter"""
    # Check for YAML frontmatter delimiters
    if not content.startswith('---\n'):
        error("SKILL.md must start with '---' on its own line")
        return None

    # Find the closing delimiter
    lines = content.split('\n')
    closing_index = None

    for i, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            closing_index = i
            break

    if closing_index is None:
        error("YAML frontmatter must end with '---' on its own line")
        return None

    # Extract YAML content
    yaml_lines = lines[1:closing_index]
    yaml_content = '\n'.join(yaml_lines)

    # Parse YAML fields (simple parser for name and description)
    frontmatter = {}

    for line in yaml_lines:
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            # Handle quoted values
            if value.startswith('"') and value.endswith('"'):
                value = value[1:-1]

            frontmatter[key] = value

    return frontmatter


def validate_name_field(name):
    """Validate the 'name' field"""
    errors = []
    warnings_list = []

    # Check if name exists
    if not name:
        errors.append("'name' field is required and cannot be empty")
        return errors, warnings_list

    # Check length
    if len(name) > 64:
        errors.append(f"'name' must be ≤64 characters (got {len(name)})")

    # Check for uppercase
    if re.search(r'[A-Z]', name):
        errors.append("'name' must be lowercase (found uppercase letters)")

    # Check for invalid characters
    if not re.match(r'^[a-z0-9-]+$', name):
        errors.append("'name' can only contain lowercase letters, numbers, and hyphens")

    # Check for reserved words
    if 'anthropic' in name or 'claude' in name:
        errors.append("'name' cannot contain reserved words 'anthropic' or 'claude'")

    # Check if starts/ends with hyphen
    if name.startswith('-') or name.endswith('-'):
        errors.append("'name' cannot start or end with hyphen")

    # Check for XML tags
    if '<' in name or '>' in name:
        errors.append("'name' cannot contain XML tags")

    return errors, warnings_list


def validate_description_field(description):
    """Validate the 'description' field"""
    errors = []
    warnings_list = []

    # Check if description exists
    if not description:
        errors.append("'description' field is required and cannot be empty")
        return errors, warnings_list

    # Check length
    if len(description) > 1024:
        errors.append(f"'description' must be ≤1024 characters (got {len(description)})")

    # Check for XML tags
    if '<' in description or '>' in description:
        errors.append("'description' cannot contain XML tags")

    # Check for trigger keywords (heuristic)
    # Description should be reasonably descriptive (> 20 chars)
    if len(description) < 20:
        warnings_list.append("'description' seems very short - include WHAT and WHEN (trigger keywords)")

    # Check for common action verbs (good practice)
    action_verbs = ['calculate', 'analyze', 'apply', 'create', 'generate', 'validate',
                    'format', 'process', 'convert', 'provide', 'use when', 'helps with']
    has_action = any(verb in description.lower() for verb in action_verbs)

    if not has_action:
        warnings_list.append("'description' should include action verbs or 'use when' for better discoverability")

    return errors, warnings_list


def validate_directory_name(skill_file_path, frontmatter):
    """Validate that directory name matches the 'name' field"""
    errors = []
    warnings_list = []

    skill_path = Path(skill_file_path)
    directory_name = skill_path.parent.name
    skill_name = frontmatter.get('name', '')

    if directory_name != skill_name:
        errors.append(
            f"Directory name '{directory_name}' does not match skill name '{skill_name}'\n"
            f"  Expected directory: .claude/skills/{skill_name}/"
        )

    return errors, warnings_list


def count_body_lines(content: str) -> Tuple[int, int]:
    """
    Count lines in SKILL.md body (excluding YAML frontmatter)
    Returns: (total_lines, body_lines)
    """
    lines = content.split('\n')

    # Find the end of YAML frontmatter
    closing_index = None
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            closing_index = i
            break

    if closing_index is None:
        # No valid frontmatter, count all lines
        return len(lines), len(lines)

    # Body starts after closing ---
    body_lines = lines[closing_index + 1:]
    return len(lines), len(body_lines)


def validate_skill_size(skill_file_path: str, content: str) -> Tuple[List[str], List[str]]:
    """Validate SKILL.md body size (500 line limit)"""
    errors = []
    warnings_list = []

    total_lines, body_lines = count_body_lines(content)

    if body_lines > 500:
        errors.append(
            f"SKILL.md body exceeds 500 line limit ({body_lines} lines)\n"
            f"  Lines to remove: {body_lines - 500}\n"
            f"  How to fix:\n"
            f"    - Extract detailed sections to reference/ files\n"
            f"    - Move full examples to examples/ directory\n"
            f"    - Keep only essential instructions in SKILL.md"
        )
    elif body_lines > 400:
        warnings_list.append(
            f"SKILL.md body is approaching 500 line limit ({body_lines}/500 lines)\n"
            f"  Consider splitting content if adding more material"
        )

    return errors, warnings_list


def get_directory_size(directory: Path) -> int:
    """Calculate total size of directory in bytes"""
    total_size = 0
    for item in directory.rglob('*'):
        if item.is_file():
            total_size += item.stat().st_size
    return total_size


def format_size(size_bytes: int) -> str:
    """Format bytes as human-readable string"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def get_largest_files(directory: Path, top_n: int = 5) -> List[Tuple[Path, int]]:
    """Get the N largest files in directory"""
    files = []
    for item in directory.rglob('*'):
        if item.is_file():
            files.append((item, item.stat().st_size))

    files.sort(key=lambda x: x[1], reverse=True)
    return files[:top_n]


def validate_bundle_size(skill_file_path: str) -> Tuple[List[str], List[str]]:
    """Validate total skill bundle size (8MB limit)"""
    errors = []
    warnings_list = []

    skill_path = Path(skill_file_path)
    skill_dir = skill_path.parent

    total_size = get_directory_size(skill_dir)
    max_size = 8 * 1024 * 1024  # 8MB in bytes

    if total_size > max_size:
        overage = total_size - max_size
        largest_files = get_largest_files(skill_dir, top_n=5)

        files_list = "\n".join([
            f"    - {f.relative_to(skill_dir)}: {format_size(size)}"
            for f, size in largest_files
        ])

        errors.append(
            f"Total skill bundle exceeds 8MB limit ({format_size(total_size)})\n"
            f"  Overage: {format_size(overage)}\n"
            f"  Largest files:\n{files_list}\n"
            f"  How to fix:\n"
            f"    - Remove redundant content\n"
            f"    - Compress or remove large images\n"
            f"    - Split large files by topic\n"
            f"    - Use external resources for very large datasets"
        )
    elif total_size > max_size * 0.75:  # Warn at 75% (6MB)
        warnings_list.append(
            f"Skill bundle is approaching 8MB limit ({format_size(total_size)}/8MB)\n"
            f"  Consider optimizing if adding more content"
        )

    return errors, warnings_list


def has_table_of_contents(file_path: Path) -> bool:
    """Check if a file has a table of contents"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().lower()
            # Look for common TOC patterns
            return ('## table of contents' in content or
                    '## contents' in content or
                    '## toc' in content)
    except:
        return False


def count_file_lines(file_path: Path) -> int:
    """Count lines in a file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return len(f.readlines())
    except:
        return 0


def validate_reference_files(skill_file_path: str, content: str) -> Tuple[List[str], List[str]]:
    """Validate reference files (TOC requirement, linking depth)"""
    errors = []
    warnings_list = []

    skill_path = Path(skill_file_path)
    skill_dir = skill_path.parent
    reference_dir = skill_dir / 'reference'

    if not reference_dir.exists():
        # No reference directory, nothing to validate
        return errors, warnings_list

    # Check for reference files >100 lines without TOC
    for ref_file in reference_dir.glob('*.md'):
        line_count = count_file_lines(ref_file)
        if line_count > 100:
            if not has_table_of_contents(ref_file):
                warnings_list.append(
                    f"Reference file '{ref_file.name}' has {line_count} lines but no table of contents\n"
                    f"  Recommendation: Add a TOC at the top for better navigation\n"
                    f"  Example:\n"
                    f"    ## Table of Contents\n"
                    f"    - [Section 1](#section-1)\n"
                    f"    - [Section 2](#section-2)"
                )

    # Check for broken reference links in SKILL.md
    # Extract all markdown links
    link_pattern = r'\[([^\]]+)\]\(([^\)]+)\)'
    links = re.findall(link_pattern, content)

    for link_text, link_path in links:
        # Skip external URLs
        if link_path.startswith('http://') or link_path.startswith('https://'):
            continue

        # Check if referenced file exists
        if link_path.startswith('reference/') or link_path.startswith('examples/') or link_path.startswith('templates/'):
            full_path = skill_dir / link_path
            if not full_path.exists():
                errors.append(
                    f"Broken link in SKILL.md: '{link_text}' -> {link_path}\n"
                    f"  File does not exist: {full_path}"
                )

    return errors, warnings_list


def validate_skill_file(file_path):
    """Main validation function"""
    print(f"\nValidating: {file_path}\n")

    # Check file exists
    if not os.path.exists(file_path):
        error(f"File not found: {file_path}")
        return False

    # Check file is named SKILL.md
    if not file_path.endswith('SKILL.md'):
        warning("File should be named 'SKILL.md'")

    # Read file content
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        error(f"Failed to read file: {e}")
        return False

    # Validate YAML frontmatter
    print("Checking YAML frontmatter...")
    frontmatter = validate_yaml_frontmatter(content)

    if frontmatter is None:
        return False

    success("YAML frontmatter format is valid")

    # Validate required fields
    all_errors = []
    all_warnings = []

    # Check 'name' field
    print("\nValidating 'name' field...")
    name = frontmatter.get('name', '')
    name_errors, name_warnings = validate_name_field(name)

    if name_errors:
        all_errors.extend(name_errors)
    else:
        success(f"'name' field is valid: {name}")

    all_warnings.extend(name_warnings)

    # Check 'description' field
    print("\nValidating 'description' field...")
    description = frontmatter.get('description', '')
    desc_errors, desc_warnings = validate_description_field(description)

    if desc_errors:
        all_errors.extend(desc_errors)
    else:
        success(f"'description' field is valid ({len(description)} characters)")

    all_warnings.extend(desc_warnings)

    # Validate directory name matches
    print("\nValidating directory name...")
    dir_errors, dir_warnings = validate_directory_name(file_path, frontmatter)

    if dir_errors:
        all_errors.extend(dir_errors)
    else:
        success("Directory name matches skill name")

    all_warnings.extend(dir_warnings)

    # Validate skill size (500 line limit)
    print("\nValidating skill size...")
    size_errors, size_warnings = validate_skill_size(file_path, content)

    if size_errors:
        all_errors.extend(size_errors)
    else:
        _, body_lines = count_body_lines(content)
        success(f"SKILL.md body size is valid ({body_lines}/500 lines)")

    all_warnings.extend(size_warnings)

    # Validate total bundle size (8MB limit)
    print("\nValidating bundle size...")
    bundle_errors, bundle_warnings = validate_bundle_size(file_path)

    if bundle_errors:
        all_errors.extend(bundle_errors)
    else:
        skill_path = Path(file_path)
        total_size = get_directory_size(skill_path.parent)
        success(f"Total bundle size is valid ({format_size(total_size)}/8MB)")

    all_warnings.extend(bundle_warnings)

    # Validate reference files
    print("\nValidating reference files...")
    ref_errors, ref_warnings = validate_reference_files(file_path, content)

    if ref_errors:
        all_errors.extend(ref_errors)
    elif ref_warnings:
        # Only show success if there are no errors or warnings
        success("Reference file linking is valid")
    else:
        success("Reference file validation passed")

    all_warnings.extend(ref_warnings)

    # Print all errors
    if all_errors:
        print(f"\n{RED}Validation Failed{NC}\n")
        for err in all_errors:
            error(err)
        print()

    # Print warnings
    if all_warnings:
        print(f"\n{YELLOW}Warnings:{NC}\n")
        for warn in all_warnings:
            warning(warn)
        print()

    # Summary
    if not all_errors and not all_warnings:
        print(f"\n{GREEN}✓ All validation checks passed!{NC}\n")
        return True
    elif not all_errors:
        print(f"\n{GREEN}✓ Validation passed with warnings{NC}\n")
        return True
    else:
        return False


def main():
    """Main entry point"""
    if len(sys.argv) != 2:
        print("Usage: validate-skill.py <path-to-SKILL.md>", file=sys.stderr)
        print("\nExample:", file=sys.stderr)
        print("  ./validate-skill.py .claude/skills/my-skill/SKILL.md", file=sys.stderr)
        sys.exit(1)

    skill_file = sys.argv[1]

    success_result = validate_skill_file(skill_file)

    if success_result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()

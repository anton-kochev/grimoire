#!/bin/bash
# Validates CLAUDE.md files meet size requirements.

MAX_LINES=100

validate() {
    local file_path="$1"

    if [ ! -f "$file_path" ]; then
        echo "Error: File not found: $file_path"
        return 1
    fi

    local line_count
    line_count=$(wc -l < "$file_path" | tr -d ' ')

    if [ "$line_count" -gt "$MAX_LINES" ]; then
        echo -e "\033[0;31m✗ $file_path has $line_count lines (max: $MAX_LINES)\033[0m"
        echo "  Consider moving detailed content to docs/ and using @imports"
        return 1
    fi

    echo -e "\033[0;32m✓ $file_path has $line_count lines (max: $MAX_LINES)\033[0m"
    return 0
}

file_path="${1:-CLAUDE.md}"
validate "$file_path"
exit $?

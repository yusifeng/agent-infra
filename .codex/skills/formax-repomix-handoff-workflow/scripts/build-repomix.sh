#!/usr/bin/env bash
set -euo pipefail

output="${1:-}"
include_csv="${2:-}"
output_dir="${3:-repomix-output}"
history_dir="${REPOMIX_OUTPUT_HISTORY_DIR:-repomix-output-history}"

if [[ -z "$output" || -z "$include_csv" ]]; then
  echo "Usage: bash .codex/skills/formax-repomix-handoff-workflow/scripts/build-repomix.sh <bundle-file-name.txt> \"<include-csv>\" [output-dir]"
  echo "Example:"
  echo "  bash .codex/skills/formax-repomix-handoff-workflow/scripts/build-repomix.sh \\\"repomix-topic-core.txt\\\" \\\"packages/core/src/screens/REPL.tsx,packages/core/src/screens/repl/transcript.tsx\\\""
  exit 2
fi

# Enforce flat output under a single handoff folder.
bundle_name="$(basename "$output")"
if [[ "$bundle_name" != *.txt ]]; then
  echo "Error: bundle file must end with .txt (got: $bundle_name)"
  exit 2
fi

if [[ "$bundle_name" != repomix-*.txt ]]; then
  echo "Warning: bundle naming convention is 'repomix-<topic>-<tier>.txt' (got: $bundle_name)"
fi

mkdir -p "$output_dir"

archive_existing_output() {
  shopt -s nullglob dotglob
  local existing=()
  for item in "$output_dir"/*; do
    [[ "$(basename "$item")" == ".gitkeep" ]] && continue
    existing+=("$item")
  done
  shopt -u nullglob dotglob

  if [[ "${#existing[@]}" -eq 0 ]]; then
    return
  fi

  local name_without_prefix name_without_ext inferred_topic archive_topic archive_path
  name_without_prefix="${bundle_name#repomix-}"
  name_without_ext="${name_without_prefix%.txt}"
  archive_topic="repomix-output"
  if [[ "$name_without_prefix" != "$bundle_name" && "$name_without_ext" == *-* ]]; then
    inferred_topic="${name_without_ext%-*}"
    archive_topic="$inferred_topic"
  fi

  archive_path="$history_dir/$(date -u +%Y%m%dT%H%M%SZ)-${archive_topic}"
  mkdir -p "$archive_path"
  mv "${existing[@]}" "$archive_path"/
  echo "Archived previous $output_dir artifacts to $archive_path"
}

# Keep only fresh artifacts for each handoff round while preserving history.
archive_existing_output

output_path="$output_dir/$bundle_name"

bunx repomix . \
  --style plain \
  --no-git-sort-by-changes \
  -o "$output_path" \
  --include "$include_csv"

echo "Created $output_path"

name_without_prefix="${bundle_name#repomix-}"
name_without_ext="${name_without_prefix%.txt}"
if [[ "$name_without_prefix" != "$bundle_name" && "$name_without_ext" == *-* ]]; then
  topic="${name_without_ext%-*}"
  echo "Next: create/update"
  echo "  $output_dir/${topic}-handoff-prompt.md"
  echo "  $output_dir/repomix-${topic}-files.md"
  echo "Then run:"
  echo "  bash .codex/skills/formax-repomix-handoff-workflow/scripts/check-handoff-artifacts.sh \"$bundle_name\" \"$topic\" \"$output_dir\""
fi

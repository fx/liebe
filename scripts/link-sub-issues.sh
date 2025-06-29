#!/bin/bash

# Script to link sub-issues to their parent issues in GitHub
# 
# This script uses GitHub's GraphQL API to create proper sub-issue relationships
# between issues. This is different from simply mentioning the parent issue in 
# the child issue description.
#
# Usage: 
#   ./scripts/link-sub-issues.sh <parent-issue> <child-issue> [<child-issue>...]
#   ./scripts/link-sub-issues.sh -r <repo> <parent-issue> <child-issue> [<child-issue>...]
#
# Examples:
#   # Link issues #12 and #13 to parent issue #1
#   ./scripts/link-sub-issues.sh 1 12 13
#
#   # Link issues to parent in a different repo
#   ./scripts/link-sub-issues.sh -r owner/repo 1 12 13
#
# Prerequisites:
# - gh CLI must be installed and authenticated
# - Requires appropriate permissions to modify issues
#
# Based on: https://github.com/joshjohanning/github-misc-scripts/blob/main/gh-cli/add-sub-issue-to-issue.sh

set -e

# Default repository (will be overridden by current repo if not specified)
REPO=""

# Parse command line arguments
if [ "$1" = "-r" ]; then
  REPO="$2"
  shift 2
fi

# If no repo specified, get current repo
if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
  if [ -z "$REPO" ]; then
    echo "Error: Not in a git repository and no repo specified with -r flag"
    echo "Usage: $0 [-r owner/repo] <parent-issue> <child-issue> [<child-issue>...]"
    exit 1
  fi
fi

# Extract owner and repo name
OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

# Check arguments
if [ $# -lt 2 ]; then
  echo "Error: Insufficient arguments"
  echo "Usage: $0 [-r owner/repo] <parent-issue> <child-issue> [<child-issue>...]"
  exit 1
fi

PARENT_ISSUE=$1
shift

echo "Repository: $OWNER/$REPO_NAME"
echo "Parent issue: #$PARENT_ISSUE"
echo "Child issues: #$@"
echo ""

# Function to get issue ID from issue number
get_issue_id() {
  local issue_number=$1
  
  issue_id=$(gh api graphql -F owner="$OWNER" -f repository="$REPO_NAME" -F number="$issue_number" -f query='
  query ($owner: String!, $repository: String!, $number: Int!) {
    repository(owner: $owner, name: $repository) {
      issue(number: $number) {
        id
      }
    }
  }' --jq '.data.repository.issue.id' 2>/dev/null)
  
  if [ $? -ne 0 ] || [ -z "$issue_id" ]; then
    echo "Error: Issue #$issue_number not found in $OWNER/$REPO_NAME"
    return 1
  fi
  
  echo "$issue_id"
}

# Function to link sub-issue to parent issue
link_sub_issue() {
  local parent_number=$1
  local child_number=$2
  
  echo -n "Linking issue #$child_number to issue #$parent_number... "
  
  # Get IDs
  parent_id=$(get_issue_id "$parent_number")
  if [ $? -ne 0 ]; then
    echo "✗ Failed (parent not found)"
    return 1
  fi
  
  child_id=$(get_issue_id "$child_number")
  if [ $? -ne 0 ]; then
    echo "✗ Failed (child not found)"
    return 1
  fi
  
  # Link the issues
  error_output=$(gh api graphql -H GraphQL-Features:issue_types -H GraphQL-Features:sub_issues \
    -f parentIssueId="$parent_id" -f childIssueId="$child_id" -f query='
  mutation($parentIssueId: ID!, $childIssueId: ID!) {
    addSubIssue(input: { issueId: $parentIssueId, subIssueId: $childIssueId }) {
      issue {
        title
        number
      }
    }
  }' 2>&1 >/dev/null)
  
  if [ $? -eq 0 ]; then
    echo "✓ Success"
    return 0
  else
    # Check if already linked
    if echo "$error_output" | grep -q "already has a parent"; then
      echo "⚠ Already linked"
      return 0
    else
      echo "✗ Failed: $error_output"
      return 1
    fi
  fi
}

# Get parent issue ID first to verify it exists
echo "Verifying parent issue #$PARENT_ISSUE..."
parent_id=$(get_issue_id "$PARENT_ISSUE")
if [ $? -ne 0 ]; then
  exit 1
fi

echo ""
echo "Linking child issues to parent..."
echo "=============================="

# Process all child issues
success_count=0
total_count=$#

for child_issue in "$@"; do
  if link_sub_issue "$PARENT_ISSUE" "$child_issue"; then
    ((success_count++))
  fi
done

echo ""
echo "Summary: $success_count/$total_count issues linked successfully"

if [ $success_count -eq $total_count ]; then
  exit 0
else
  exit 1
fi
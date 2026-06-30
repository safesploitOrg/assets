#!/bin/bash
set -euo pipefail

# ==============================================================================
# DNS Configs Sync Script for dnsmasq
# ==============================================================================
# Author: @safesploit
# Date: 2026-06-30
#
# Description:
#   Periodically checks the safesploitOrg/dns-configs repository for changes
#   affecting the dnsmasq/ path on the main branch.
#
#   If dnsmasq-specific changes are detected, the script:
#     - Clones the repository
#     - Validates dnsmasq.d and hosts.d content
#     - Syncs dnsmasq config snippets
#     - Syncs dnsmasq hosts.d files
#     - Sets safe permissions
#     - Restarts dnsmasq
#     - Records the last applied dnsmasq path commit
#
# Cron usage example every 5 minutes:
#   */5 * * * * /root/git_clone_dns_configs_dnsmasq.sh --quiet
#
# Manual verbose run:
#   ./git_clone_dns_configs_dnsmasq.sh
#
# Quiet run:
#   ./git_clone_dns_configs_dnsmasq.sh --quiet
# ==============================================================================

# ----------------
# Global Variables
# ----------------
REPO="dns-configs"
OWNER="safesploitOrg"
BRANCH="main"
REPO_FULL_LINK="git@github.com:${OWNER}/${REPO}.git"

GITHUB_DEPLOY_KEY="${HOME}/.ssh/id_github_ed25519"

WORKDIR="/tmp"
CHECK_REPO_DIR="${WORKDIR}/${REPO}.git-check"

STATE_DIR="/var/lib/${REPO}-dnsmasq-sync"
STATE_FILE="${STATE_DIR}/last_dnsmasq_commit"

LOG_FILE="/var/log/${REPO}-dnsmasq-sync.log"

SOURCE_DNSMASQ_DIR="${WORKDIR}/${REPO}/dnsmasq"
SOURCE_DNSMASQ_CONF_DIR="${SOURCE_DNSMASQ_DIR}/dnsmasq.d/"
SOURCE_HOSTS_DIR="${SOURCE_DNSMASQ_DIR}/hosts.d/"

DESTINATION_DNSMASQ_CONF_DIR="/etc/dnsmasq.d/"
DESTINATION_HOSTS_DIR="/etc/hosts.d/"

DNSMASQ_SERVICE="dnsmasq"

DNSMASQ_USER="root"
DNSMASQ_GROUP="root"

QUIET=false
DETECTED_COMMIT=""

# ANSI colour codes - console only
BLUE='\033[0;34m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ----------------
# Logging
# ----------------
log() {
    local msg="$*"
    local timestamp

    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

    echo "[${timestamp}] ${msg}" >> "${LOG_FILE}"

    if [[ "${QUIET}" == false ]]; then
        echo -e "${msg}"
    fi
}

# ----------------
# Argument Parsing
# ----------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -q|--quiet)
                QUIET=true
                ;;
            *)
                echo "Unknown argument: $1"
                exit 1
                ;;
        esac

        shift
    done
}

# ----------------
# SSH Handling
# ----------------
setup_ssh() {
    log "${BLUE}Setting up SSH agent${NC}"

    if [[ ! -f "${GITHUB_DEPLOY_KEY}" ]]; then
        log "${RED}Deploy key not found: ${GITHUB_DEPLOY_KEY}${NC}"
        exit 1
    fi

    eval "$(ssh-agent -s)" >/dev/null
    ssh-add "${GITHUB_DEPLOY_KEY}" >/dev/null
}

cleanup_ssh() {
    if [[ -n "${SSH_AGENT_PID:-}" ]]; then
        log "${BLUE}Killing SSH agent${NC}"
        eval "$(ssh-agent -k)" >/dev/null
    fi
}

# ----------------
# Environment Prep
# ----------------
prepare_environment() {
    mkdir -p "${WORKDIR}"
    mkdir -p "${STATE_DIR}"
    mkdir -p "$(dirname "${LOG_FILE}")"

    touch "${LOG_FILE}"

    cd "${WORKDIR}"
}

# ----------------
# Dependency Checks
# ----------------
check_dependencies() {
    local missing_deps=0
    local required_commands=(
        git
        rsync
        awk
        find
        tail
        od
        systemctl
        dnsmasq
    )

    log "${BLUE}Checking required dependencies${NC}"

    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" >/dev/null 2>&1; then
            log "${RED}Missing required command: ${cmd}${NC}"
            missing_deps=1
        fi
    done

    if [[ "${missing_deps}" -ne 0 ]]; then
        log "${RED}One or more required dependencies are missing${NC}"
        exit 1
    fi
}

# ----------------
# Git State Helpers
# ----------------
ensure_git_check_repo() {
    if [[ ! -d "${CHECK_REPO_DIR}" ]]; then
        log "${BLUE}Creating bare Git check repository${NC}"

        git clone \
            --bare \
            "${REPO_FULL_LINK}" \
            "${CHECK_REPO_DIR}" >/dev/null
    fi
}

fetch_remote_state() {
    log "${BLUE}Fetching remote state for ${BRANCH}${NC}"

    cd "${CHECK_REPO_DIR}"

    git fetch \
        origin \
        "${BRANCH}" >/dev/null
}

get_remote_dnsmasq_commit() {
    cd "${CHECK_REPO_DIR}"

    git rev-parse "origin/${BRANCH}:dnsmasq" 2>/dev/null
}

get_cached_commit() {
    if [[ -f "${STATE_FILE}" ]]; then
        cat "${STATE_FILE}"
    else
        echo ""
    fi
}

save_commit() {
    mkdir -p "${STATE_DIR}"
    echo "$1" > "${STATE_FILE}"
}

# ----------------
# Change Detection
# ----------------
detect_dnsmasq_changes() {
    local remote_commit
    local cached_commit

    remote_commit="$(get_remote_dnsmasq_commit)"
    cached_commit="$(get_cached_commit)"

    if [[ -z "${remote_commit}" ]]; then
        log "${RED}Could not determine remote dnsmasq path commit${NC}"
        exit 1
    fi

    if [[ "${remote_commit}" == "${cached_commit}" ]]; then
        log "${GREEN}No dnsmasq changes detected on ${BRANCH}. Exiting.${NC}"
        return 1
    fi

    log "${BLUE}dnsmasq changes detected on ${BRANCH}${NC}"
    log "Old dnsmasq commit: ${cached_commit}"
    log "New dnsmasq commit: ${remote_commit}"

    DETECTED_COMMIT="${remote_commit}"

    return 0
}

# ----------------
# Repo Operations
# ----------------
clone_repo() {
    cd "${WORKDIR}"

    log "${GREEN}Cloning ${REPO_FULL_LINK} branch ${BRANCH}${NC}"

    git clone \
        --branch "${BRANCH}" \
        --depth 1 \
        "${REPO_FULL_LINK}"
}

cleanup_repo() {
    cd "${WORKDIR}"
    rm -rf "${REPO}"
}

# ----------------
# Source Validation
# ----------------
validate_source_directories() {
    log "${BLUE}Validating source directories${NC}"

    if [[ ! -d "${SOURCE_DNSMASQ_DIR}" ]]; then
        log "${RED}Source directory not found: ${SOURCE_DNSMASQ_DIR}${NC}"
        exit 1
    fi

    if [[ ! -d "${SOURCE_DNSMASQ_CONF_DIR}" ]]; then
        log "${RED}Source directory not found: ${SOURCE_DNSMASQ_CONF_DIR}${NC}"
        exit 1
    fi

    if [[ ! -d "${SOURCE_HOSTS_DIR}" ]]; then
        log "${RED}Source directory not found: ${SOURCE_HOSTS_DIR}${NC}"
        exit 1
    fi
}

validate_newline_at_eof() {
    log "${BLUE}Validating newline at EOF${NC}"

    find "${SOURCE_DNSMASQ_DIR}" \
        -type f \
        \( -name '*.cfg' -o -name '*.conf' -o -name '*.hosts' -o -name '*.txt' -o ! -name '*.*' \) \
        | while read -r file; do

            local last_char
            last_char="$(tail -c1 "${file}" | od -An -t uC | tr -d ' ')"

            if [[ -z "${last_char}" ]]; then
                log "${RED}ERROR: ${file} is empty${NC}"
                exit 1
            fi

            if [[ "${last_char}" -ne 10 ]]; then
                log "${RED}ERROR: ${file} does not end with newline${NC}"
                exit 1
            fi
        done
}

validate_hosts_format() {
    log "${BLUE}Validating hosts.d file format${NC}"

    awk '
        BEGIN {
            errors = 0
        }

        /^[[:space:]]*$/ {
            next
        }

        /^[[:space:]]*#/ {
            next
        }

        {
            if (NF < 2) {
                printf("ERROR: Invalid hosts line in %s at line %d: %s\n", FILENAME, FNR, $0)
                errors++
                next
            }

            if ($1 !~ /^([0-9]{1,3}\.){3}[0-9]{1,3}$/ && $1 !~ /^[0-9a-fA-F:]+$/) {
                printf("ERROR: First field is not an IPv4/IPv6 address in %s at line %d: %s\n", FILENAME, FNR, $0)
                errors++
                next
            }
        }

        END {
            if (errors > 0) {
                exit 1
            }
        }
    ' "${SOURCE_HOSTS_DIR}"/*

    log "${GREEN}hosts.d format validation passed${NC}"
}

validate_duplicate_hostnames() {
    log "${BLUE}Checking for duplicate hostnames${NC}"

    awk '
        /^[[:space:]]*$/ {
            next
        }

        /^[[:space:]]*#/ {
            next
        }

        {
            for (i = 2; i <= NF; i++) {
                if ($i ~ /^#/) {
                    break
                }

                host_count[$i]++
                host_ip[$i] = host_ip[$i] " " $1
            }
        }

        END {
            duplicate_count = 0

            for (host in host_count) {
                if (host_count[host] > 1) {
                    printf("ERROR: Duplicate hostname detected: %s ->%s\n", host, host_ip[host])
                    duplicate_count++
                }
            }

            if (duplicate_count > 0) {
                exit 1
            }
        }
    ' "${SOURCE_HOSTS_DIR}"/*

    log "${GREEN}Duplicate hostname validation passed${NC}"
}

validate_dnsmasq_config() {
    local temp_conf
    local temp_hosts
    local temp_conf_dir

    temp_conf="/tmp/dnsmasq-predeploy.conf"
    temp_hosts="/tmp/dnsmasq-predeploy-hosts"
    temp_conf_dir="/tmp/dnsmasq-predeploy.d"

    log "${BLUE}Running dnsmasq syntax validation${NC}"

    rm -rf "${temp_conf_dir}"
    mkdir -p "${temp_conf_dir}"
    : > "${temp_hosts}"

    rsync -a "${SOURCE_DNSMASQ_CONF_DIR}" "${temp_conf_dir}/"

    find "${SOURCE_HOSTS_DIR}" \
        -type f \
        | sort \
        | while read -r file; do
            cat "${file}" >> "${temp_hosts}"
            echo "" >> "${temp_hosts}"
        done

    cat > "${temp_conf}" <<EOF
port=0
no-resolv
domain-needed
bogus-priv
expand-hosts
domain=safesploit.com
addn-hosts=${temp_hosts}
conf-dir=${temp_conf_dir},*.conf,*.cfg
EOF

    dnsmasq \
        --test \
        --conf-file="${temp_conf}"

    rm -f "${temp_conf}" "${temp_hosts}"
    rm -rf "${temp_conf_dir}"

    log "${GREEN}dnsmasq syntax validation passed${NC}"
}

pre_deploy_checks() {
    validate_source_directories
    # validate_newline_at_eof
    validate_hosts_format
    validate_duplicate_hostnames
    validate_dnsmasq_config
}

# ----------------
# dnsmasq Handling
# ----------------
copy_dnsmasq_configs() {
    log "${BLUE}Syncing dnsmasq.d files${NC}"

    mkdir -p "${DESTINATION_DNSMASQ_CONF_DIR}"

    rsync -a --delete \
        "${SOURCE_DNSMASQ_CONF_DIR}" \
        "${DESTINATION_DNSMASQ_CONF_DIR}"
}

copy_hosts_files() {
    log "${BLUE}Syncing hosts.d files${NC}"

    mkdir -p "${DESTINATION_HOSTS_DIR}"

    rsync -a --delete \
        "${SOURCE_HOSTS_DIR}" \
        "${DESTINATION_HOSTS_DIR}"
}

set_dnsmasq_permissions() {
    log "${BLUE}Setting dnsmasq file ownership and permissions${NC}"

    chown -R "${DNSMASQ_USER}:${DNSMASQ_GROUP}" "${DESTINATION_DNSMASQ_CONF_DIR}"
    chown -R "${DNSMASQ_USER}:${DNSMASQ_GROUP}" "${DESTINATION_HOSTS_DIR}"

    find "${DESTINATION_DNSMASQ_CONF_DIR}" \
        -type d \
        -exec chmod 755 {} \;

    find "${DESTINATION_DNSMASQ_CONF_DIR}" \
        -type f \
        -exec chmod 644 {} \;

    find "${DESTINATION_HOSTS_DIR}" \
        -type d \
        -exec chmod 755 {} \;

    find "${DESTINATION_HOSTS_DIR}" \
        -type f \
        -exec chmod 644 {} \;
}

restart_dnsmasq() {
    log "${BLUE}Restarting ${DNSMASQ_SERVICE}${NC}"

    systemctl restart "${DNSMASQ_SERVICE}"

    systemctl is-active \
        --quiet \
        "${DNSMASQ_SERVICE}"

    log "${GREEN}${DNSMASQ_SERVICE} restarted successfully${NC}"
}

# ----------------
# Apply Updates
# ----------------
apply_updates() {
    cd "${WORKDIR}"
    rm -rf "${REPO}"

    clone_repo

    # Done via CI too
    pre_deploy_checks

    copy_dnsmasq_configs
    copy_hosts_files
    set_dnsmasq_permissions
    restart_dnsmasq
    save_commit "${DETECTED_COMMIT}"
    cleanup_repo

    log "${GREEN}dnsmasq update applied successfully${NC}"
}

# ----------------
# Main
# ----------------
main() {
    parse_args "$@"

    trap cleanup_ssh EXIT

    prepare_environment
    check_dependencies
    setup_ssh
    ensure_git_check_repo
    fetch_remote_state

    detect_dnsmasq_changes || exit 0

    apply_updates
}

# Execute
main "$@"
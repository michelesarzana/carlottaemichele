set -x
cd "$(dirname "$0")/../.."
curl -sSL https://api.github.com/repos/supabase/cli/releases?per_page=6 | jq -r '.[] | "\(.tag_name) \(.published_at) prerelease=\(.prerelease)"'
V=$(curl -sSL https://api.github.com/repos/supabase/cli/releases/latest | jq -r .tag_name | tr -d v)
curl -sSL -o /tmp/s.tgz "https://github.com/supabase/cli/releases/download/v$V/supabase_linux_amd64.tar.gz" && tar -xzf /tmp/s.tgz -C /tmp
/tmp/supabase --version
SUPABASE_ACCESS_TOKEN=sbp_$(printf "0%.0s" $(seq 40)) timeout 120 /tmp/supabase functions deploy enrich-places --project-ref btyvzzmyzmlvyhxwavxd --no-verify-jwt --use-api 2>&1 | tail -30

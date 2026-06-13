<#
.SYNOPSIS
    Windows convenience wrapper around `claude-router launch`.

.DESCRIPTION
    Translates the familiar -Context / -UseClaudePro / -BypassPermissions
    parameters into a `claude-router launch` invocation.

    All ARN resolution, AWS authentication, and settings.local.json management
    are handled by `claude-router launch`. Context definitions live in
    ~/.claude-router.json under the bedrock_contexts key.

    macOS/Linux users invoke `claude-router launch` directly — this script
    exists only as a Windows convenience entry point.

.PARAMETER Context
    (Bedrock mode) The context name defined in ~/.claude-router.json.
    Determines which Bedrock inference profile ARNs to use.

.PARAMETER UseClaudePro
    (Direct mode) Use the Anthropic API directly; removes Bedrock settings.
    Mutually exclusive with -Context.

.PARAMETER BypassPermissions
    Passes --permission-mode bypassPermissions to the claude invocation.

.EXAMPLE
    .\Start-Claude.ps1 -Context team-a -BypassPermissions

.EXAMPLE
    .\Start-Claude.ps1 -UseClaudePro
#>

[CmdletBinding(DefaultParameterSetName = 'Bedrock')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Bedrock')]
    [string]$Context,

    [Parameter(Mandatory = $true, ParameterSetName = 'Direct')]
    [switch]$UseClaudePro,

    [Parameter()]
    [switch]$BypassPermissions
)

if (-not (Get-Command 'claude-router' -ErrorAction SilentlyContinue)) {
    Write-Error "claude-router not found. Install with: npm install -g @0dust/claude-router"
    exit 1
}

if ($PSCmdlet.ParameterSetName -eq 'Direct') {
    $launchArgs = @('launch', '--direct')
    $host.UI.RawUI.WindowTitle = 'claude-api'
} else {
    $launchArgs = @('launch', '--bedrock', '--context', $Context)
    $host.UI.RawUI.WindowTitle = $Context
}

if ($BypassPermissions) {
    $launchArgs += '--bypass-permissions'
}

& claude-router @launchArgs
exit $LASTEXITCODE

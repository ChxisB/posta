namespace MillionSend;

/// <summary>
/// Configuration for a <see cref="MillionSendClient"/>. Both values fall back to
/// environment variables when unset: <c>ApiToken</c> to <c>MILLIONSEND_API_KEY</c>,
/// <c>ApiUrl</c> to <c>MILLIONSEND_BASE_URL</c> (then to MillionSend Cloud,
/// <c>https://api.millionsend.com</c>).
/// </summary>
public sealed class MillionSendClientOptions
{
    /// <summary>Bearer API token. Falls back to <c>MILLIONSEND_API_KEY</c>.</summary>
    public string? ApiToken { get; set; }

    /// <summary>
    /// Your MillionSend instance URL (no trailing slash needed). Falls back to
    /// <c>MILLIONSEND_BASE_URL</c>, then <c>https://api.millionsend.com</c> (MillionSend
    /// Cloud). A self-hosted instance sets its own origin here.
    /// </summary>
    public string? ApiUrl { get; set; }

    /// <summary>
    /// Accept a plain <c>http://</c> <see cref="ApiUrl"/> on a non-loopback host. Off by
    /// default because the API key travels as a bearer header.
    /// </summary>
    public bool AllowInsecureHttp { get; set; }
}

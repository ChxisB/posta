namespace Posta;

/// <summary>
/// Configuration for a <see cref="PostaClient"/>. Both values fall back to
/// environment variables when unset: <c>ApiToken</c> to <c>POSTA_API_KEY</c>,
/// <c>ApiUrl</c> to <c>POSTA_BASE_URL</c> (then to Posta Cloud,
/// <c>https://api.posta.example</c>).
/// </summary>
public sealed class PostaClientOptions
{
    /// <summary>Bearer API token. Falls back to <c>POSTA_API_KEY</c>.</summary>
    public string? ApiToken { get; set; }

    /// <summary>
    /// Your Posta instance URL (no trailing slash needed). Falls back to
    /// <c>POSTA_BASE_URL</c>, then <c>https://api.posta.example</c> (Posta
    /// Cloud). A self-hosted instance sets its own origin here.
    /// </summary>
    public string? ApiUrl { get; set; }

    /// <summary>
    /// Accept a plain <c>http://</c> <see cref="ApiUrl"/> on a non-loopback host. Off by
    /// default because the API key travels as a bearer header.
    /// </summary>
    public bool AllowInsecureHttp { get; set; }
}

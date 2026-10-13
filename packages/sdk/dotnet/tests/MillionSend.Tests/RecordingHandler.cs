using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

// Environment variables are process-global; several tests set them. Keep the
// whole assembly single-threaded so those never race the gated e2e test.
[assembly: Xunit.CollectionBehavior(DisableTestParallelization = true)]

namespace MillionSend.Tests;

/// <summary>Captures every request and returns a canned response (or throws).</summary>
internal sealed class RecordingHandler : HttpMessageHandler
{
    public sealed record Call(
        string Method,
        string Path,
        string Query,
        string Url,
        string? Body,
        string? Authorization,
        string? UserAgent,
        string? IdempotencyKey,
        string? BatchValidation);

    public List<Call> Calls { get; } = new();
    public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
    public string ResponseBody { get; set; } = "{\"id\":\"11111111-1111-1111-1111-111111111111\"}";
    public Exception? Throw { get; set; }

    public Call Last => Calls[^1];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        var uri = request.RequestUri!;
        // UriEscaped keeps percent-encoding deterministic (e.g. "@" -> "%40").
        var path = "/" + uri.GetComponents(UriComponents.Path, UriFormat.UriEscaped);
        string? idem = request.Headers.TryGetValues("Idempotency-Key", out var v) ? string.Join(",", v) : null;
        string? validation = request.Headers.TryGetValues("x-batch-validation", out var bv) ? string.Join(",", bv) : null;

        Calls.Add(new Call(
            request.Method.Method,
            path,
            uri.Query,
            uri.ToString(),
            body,
            request.Headers.Authorization?.ToString(),
            request.Headers.UserAgent?.ToString(),
            idem,
            validation));

        if (Throw is not null) throw Throw;
        return new HttpResponseMessage(Status)
        {
            Content = new StringContent(ResponseBody, Encoding.UTF8, "application/json"),
        };
    }

    public JsonElement LastJson() => JsonDocument.Parse(Last.Body!).RootElement;
}

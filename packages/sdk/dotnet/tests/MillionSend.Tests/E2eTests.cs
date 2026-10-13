using System;
using System.Threading.Tasks;
using Xunit;

namespace MillionSend.Tests;

/// <summary>
/// Opt-in smoke test against a real MillionSend instance. Gated on
/// MILLIONSEND_E2E=1 — deliberately NOT on MILLIONSEND_API_KEY, which the SDK
/// itself reads and a developer may have exported for other work; that would
/// make plain `dotnet test` mutate a live instance. Requires the key (and
/// MILLIONSEND_BASE_URL for a self-hosted instance; the default is
/// MillionSend Cloud) as usual. Exercises the
/// contact lifecycle, which needs no verified sender domain.
///
///     MILLIONSEND_E2E=1 MILLIONSEND_API_KEY=ms_... \
///         dotnet test --filter Category=e2e
/// </summary>
[Trait("Category", "e2e")]
public class E2eTests
{
    private static bool Enabled =>
        Environment.GetEnvironmentVariable("MILLIONSEND_E2E") == "1"
        && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("MILLIONSEND_API_KEY"));

    [Fact]
    public async Task Contact_lifecycle()
    {
        if (!Enabled) return; // gated: no key, no run

        var client = new MillionSendClient(new MillionSendClientOptions());
        var stamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var email = $"sdk-e2e-{stamp}@example.com";

        var created = await client.ContactAddAsync(new ContactCreateOptions
        {
            Email = email,
            FirstName = "Ada",
        });
        Assert.True(created.Success, created.Exception?.Message);

        try
        {
            var fetched = await client.ContactRetrieveAsync(new ContactAddress { Email = email });
            Assert.True(fetched.Success, fetched.Exception?.Message);
            Assert.Equal(email, fetched.Content!.Email);
            Assert.Equal("Ada", fetched.Content.FirstName);

            var updated = await client.ContactUpdateAsync(new ContactUpdateOptions
            {
                Email = email,
                Unsubscribed = true,
            });
            Assert.True(updated.Success, updated.Exception?.Message);
        }
        finally
        {
            var removed = await client.ContactDeleteAsync(new ContactAddress { Email = email });
            Assert.True(removed.Success, removed.Exception?.Message);
            Assert.True(removed.Content!.Deleted);
        }
    }

    [Fact]
    public async Task Not_found_surfaces_as_error()
    {
        if (!Enabled) return; // gated: no key, no run

        var client = new MillionSendClient(new MillionSendClientOptions());
        var res = await client.ContactRetrieveAsync(new ContactAddress { Email = "does-not-exist@example.com" });
        Assert.False(res.Success);
        Assert.Equal("not_found", res.Exception!.ErrorName);
    }
}

namespace Posta;

/// <summary>
/// The result of every SDK call. Methods never throw for an API or transport
/// error — inspect <see cref="Success"/>, then read <see cref="Content"/> on
/// success or <see cref="Exception"/> on failure.
/// </summary>
public sealed class PostaResponse<T>
{
    /// <summary>True when the call succeeded (<see cref="Exception"/> is <c>null</c>).</summary>
    public bool Success => Exception is null;

    /// <summary>The deserialized response body on success; otherwise <c>default</c>.</summary>
    public T? Content { get; }

    /// <summary>The error on failure; otherwise <c>null</c>.</summary>
    public PostaException? Exception { get; }

    private PostaResponse(T? content, PostaException? exception)
    {
        Content = content;
        Exception = exception;
    }

    internal static PostaResponse<T> Ok(T? content) => new(content, null);

    internal static PostaResponse<T> Fail(PostaException exception) => new(default, exception);
}

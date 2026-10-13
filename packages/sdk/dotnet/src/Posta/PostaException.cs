using System;

namespace Posta;

/// <summary>
/// A failed Posta call. Carried on <see cref="PostaResponse{T}.Exception"/>
/// rather than thrown (see <see cref="PostaResponse{T}"/>).
/// </summary>
public sealed class PostaException : Exception
{
    /// <summary>HTTP status, or <c>null</c> when the request never reached the API.</summary>
    public int? StatusCode { get; }

    /// <summary>
    /// The API's stable <c>name</c> discriminant (e.g. <c>"validation_error"</c>,
    /// <c>"not_found"</c>), or <c>"application_error"</c> for a client-side failure.
    /// </summary>
    public string ErrorName { get; }

    public PostaException(string message, int? statusCode, string errorName)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorName = errorName;
    }
}

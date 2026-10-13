using System;

namespace MillionSend;

/// <summary>
/// A failed MillionSend call. Carried on <see cref="MillionSendResponse{T}.Exception"/>
/// rather than thrown (see <see cref="MillionSendResponse{T}"/>).
/// </summary>
public sealed class MillionSendException : Exception
{
    /// <summary>HTTP status, or <c>null</c> when the request never reached the API.</summary>
    public int? StatusCode { get; }

    /// <summary>
    /// The API's stable <c>name</c> discriminant (e.g. <c>"validation_error"</c>,
    /// <c>"not_found"</c>), or <c>"application_error"</c> for a client-side failure.
    /// </summary>
    public string ErrorName { get; }

    public MillionSendException(string message, int? statusCode, string errorName)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorName = errorName;
    }
}

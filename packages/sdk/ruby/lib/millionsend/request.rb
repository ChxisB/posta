# frozen_string_literal: true

require "net/http"
require "json"
require "uri"
require "timeout"
require "openssl"

module Millionsend
  # Internal: builds and performs one HTTP call over net/http, then returns the
  # parsed (symbol-keyed) body or raises a Millionsend::Error. The resource
  # modules are thin wrappers over this.
  class Request
    VERBS = {
      get: Net::HTTP::Get,
      post: Net::HTTP::Post,
      patch: Net::HTTP::Patch,
      delete: Net::HTTP::Delete,
    }.freeze

    # Transport-level failures that never produced an HTTP response -> the
    # raised error carries status_code nil. Kept narrow so a mis-stubbed test
    # (WebMock::NetConnectNotAllowedError) is not swallowed as a transport error.
    TRANSPORT_ERRORS = [
      Timeout::Error, SocketError, SystemCallError, IOError,
      Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError,
    ].freeze

    def initialize(method:, path:, body: nil, query: nil, idempotency_key: nil, batch_validation: nil)
      @method = method
      @path = path
      @body = body
      @query = query
      @idempotency_key = idempotency_key
      @batch_validation = batch_validation
    end

    def perform
      api_key = Millionsend.api_key
      if api_key.nil? || api_key.to_s.empty?
        # Client-side failure: same class and stable name as a transport error,
        # so rescue Millionsend::ApplicationError / branching on e.name works.
        raise Millionsend::ApplicationError.new(
          "Missing API key. Set Millionsend.api_key or the MILLIONSEND_API_KEY environment variable.",
          nil, "application_error"
        )
      end

      uri = build_uri
      request = build_request(uri, api_key)

      response =
        begin
          Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
            http.request(request)
          end
        rescue *TRANSPORT_ERRORS => e
          raise Millionsend::ApplicationError.new(e.message, nil, "application_error")
        end

      handle(response)
    end

    private

    def build_uri
      base = Millionsend.base_url.to_s.sub(%r{/+\z}, "")
      uri = URI.parse("#{base}#{@path}")
      if !Millionsend.allow_insecure_http && Millionsend::Util.insecure_http?(uri)
        raise Millionsend::ApplicationError.new(
          "Refusing to send the API key over plain http to #{base}. " \
          "Use https, or set Millionsend.allow_insecure_http = true.",
          nil, "application_error"
        )
      end
      query = (@query || {}).reject { |_, v| v.nil? }
      uri.query = URI.encode_www_form(query) unless query.empty?
      uri
    end

    def build_request(uri, api_key)
      request = VERBS.fetch(@method).new(uri.request_uri)
      request["Authorization"] = "Bearer #{api_key}"
      request["Accept"] = "application/json"
      request["User-Agent"] = Millionsend::USER_AGENT
      unless @body.nil?
        request["Content-Type"] = "application/json"
        request.body = JSON.generate(@body)
      end
      # Idempotency is POST-only on the wire; ignored on other verbs.
      request["Idempotency-Key"] = @idempotency_key if @idempotency_key && @method == :post
      request["x-batch-validation"] = @batch_validation.to_s if @batch_validation
      request
    end

    def handle(response)
      status = response.code.to_i
      body = parse(response.body)
      raise Millionsend::Error.from_response(status, body) unless (200..299).cover?(status)

      body
    end

    def parse(text)
      return nil if text.nil? || text.empty?

      JSON.parse(text, symbolize_names: true)
    rescue JSON::ParserError
      text
    end
  end
end

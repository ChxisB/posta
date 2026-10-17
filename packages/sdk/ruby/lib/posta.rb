# frozen_string_literal: true

require "posta/version"
require "posta/util"
require "posta/error"
require "posta/request"
require "posta/emails"
require "posta/batch"
require "posta/contacts"
require "posta/contact_properties"
require "posta/topics"
require "posta/broadcasts"
require "posta/segments"
require "posta/suppressions"
require "posta/domains"
require "posta/webhooks"
require "posta/api_keys"
require "posta/templates"
require "posta/usage"
require "posta/deliverability"

# Ruby client for the Posta HTTP API. Configure once, then call the
# resource modules:
#
#   Posta.api_key  = "po_..."
#   Posta.base_url = "https://mail.acme.dev"
#   Posta::Emails.send(from: "onboarding@acme.dev", to: "you@example.com",
#                      subject: "Hi", html: "<strong>it works</strong>")
#
# api_key falls back to the POSTA_API_KEY env var; base_url to
# POSTA_BASE_URL and then Posta Cloud, so a self-hosted instance
# sets its own origin. Plain http is only accepted for
# loopback hosts unless allow_insecure_http is set, since the API key travels
# as a bearer header. Every call returns a symbol-keyed Hash on success and
# raises a Posta::Error on any non-2xx response.
module Posta
  DEFAULT_BASE_URL = "https://api.posta.example"
  USER_AGENT = "posta-ruby/#{VERSION}"

  class << self
    attr_writer :api_key, :base_url
    attr_accessor :allow_insecure_http

    def api_key
      @api_key || ENV["POSTA_API_KEY"]
    end

    def base_url
      @base_url || ENV["POSTA_BASE_URL"] || DEFAULT_BASE_URL
    end
  end
end

# frozen_string_literal: true

require_relative "lib/millionsend/version"

Gem::Specification.new do |spec|
  spec.name        = "millionsend"
  spec.version     = Millionsend::VERSION
  spec.summary     = "Official Ruby SDK for MillionSend — a self-hostable, Resend-compatible email API."
  spec.description = "Ruby client for the MillionSend HTTP API: emails, batch, contacts, " \
                     "contact properties, topics, broadcasts, segments, suppressions, domains, " \
                     "webhooks, API keys, templates and usage. Wire-compatible with Resend and " \
                     "mirror-shaped after resend-ruby, so migrating is mostly an import swap."
  spec.authors     = ["MillionSend"]
  spec.homepage    = "https://github.com/MillionSend/millionsend-ruby"
  spec.license     = "MIT"
  spec.required_ruby_version = ">= 3.0"

  spec.files         = Dir["lib/**/*.rb"] + ["README.md", "LICENSE"]
  spec.require_paths = ["lib"]

  spec.metadata = {
    "source_code_uri"       => "https://github.com/MillionSend/millionsend-ruby",
    "rubygems_mfa_required" => "true",
  }

  spec.add_development_dependency "rake", "~> 13.0"
  spec.add_development_dependency "rspec", "~> 3.12"
  spec.add_development_dependency "rubocop", "1.91.0"
  spec.add_development_dependency "webmock", "~> 3.19"
end

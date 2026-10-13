# frozen_string_literal: true

require "millionsend"
require "webmock/rspec"

WebMock.disable_net_connect!

module EnvHelper
  # Temporarily set/clear env vars for one example, restoring them afterward.
  def with_env(vars)
    original = {}
    vars.each do |key, value|
      original[key] = ENV[key]
      value.nil? ? ENV.delete(key) : ENV[key] = value
    end
    yield
  ensure
    original.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end
end

RSpec.configure do |config|
  config.include EnvHelper

  config.expect_with(:rspec) { |c| c.syntax = :expect }
  config.disable_monkey_patching!

  # Point every unit example at a deterministic instance. The gated e2e group
  # (tagged :e2e) opts out so it can read the real key/URL from the environment.
  config.before do |example|
    unless example.metadata[:e2e]
      Millionsend.api_key = "ms_test"
      Millionsend.base_url = "https://api.test"
    end
  end
end

# frozen_string_literal: true

module Millionsend
  # Plan limits and today's send count — a MillionSend extension.
  module Usage
    class << self
      # GET /usage
      def get
        Millionsend::Request.new(method: :get, path: "/usage").perform
      end
    end
  end
end

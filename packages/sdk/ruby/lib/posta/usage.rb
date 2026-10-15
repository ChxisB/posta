# frozen_string_literal: true

module Posta
  # Plan limits and today's send count: a Posta extension.
  module Usage
    class << self
      # GET /usage
      def get
        Posta::Request.new(method: :get, path: "/usage").perform
      end
    end
  end
end

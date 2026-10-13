# frozen_string_literal: true

module Millionsend
  # Account-level deliverability score over the trailing window
  # (scores are 0-10, one decimal; null means not enough data).
  module Deliverability
    class << self
      # GET /deliverability
      def get
        Millionsend::Request.new(method: :get, path: "/deliverability").perform
      end
    end
  end
end

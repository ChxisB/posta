# frozen_string_literal: true

module Millionsend
  # Subscription topics — granular unsubscribe categories.
  module Topics
    class << self
      # POST /topics — name, default_subscription, description, visibility.
      def create(params)
        Millionsend::Request.new(method: :post, path: "/topics", body: params).perform
      end

      # GET /topics/:id
      def get(id)
        Millionsend::Request.new(method: :get, path: "/topics/#{Millionsend::Util.encode(id)}").perform
      end

      # GET /topics — a bare { data: [...] } (topics are unpaginated).
      def list
        Millionsend::Request.new(method: :get, path: "/topics").perform
      end

      # PATCH /topics/:id — name, description, visibility.
      def update(id, params)
        Millionsend::Request.new(method: :patch, path: "/topics/#{Millionsend::Util.encode(id)}", body: params).perform
      end

      # DELETE /topics/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: "/topics/#{Millionsend::Util.encode(id)}").perform
      end
    end
  end
end

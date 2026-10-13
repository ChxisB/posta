# frozen_string_literal: true

module Posta
  # Subscription topics — granular unsubscribe categories.
  module Topics
    class << self
      # POST /topics — name, default_subscription, description, visibility.
      def create(params)
        Posta::Request.new(method: :post, path: "/topics", body: params).perform
      end

      # GET /topics/:id
      def get(id)
        Posta::Request.new(method: :get, path: "/topics/#{Posta::Util.encode(id)}").perform
      end

      # GET /topics — a bare { data: [...] } (topics are unpaginated).
      def list
        Posta::Request.new(method: :get, path: "/topics").perform
      end

      # PATCH /topics/:id — name, description, visibility.
      def update(id, params)
        Posta::Request.new(method: :patch, path: "/topics/#{Posta::Util.encode(id)}", body: params).perform
      end

      # DELETE /topics/:id
      def remove(id)
        Posta::Request.new(method: :delete, path: "/topics/#{Posta::Util.encode(id)}").perform
      end
    end
  end
end

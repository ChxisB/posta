# frozen_string_literal: true

module Posta
  # Sending domains and their DNS records.
  module Domains
    class << self
      # POST /domains: name, region, custom_return_path, open_tracking,
      # click_tracking, tracking_subdomain. Returns the records to publish.
      def create(params)
        Posta::Request.new(method: :post, path: "/domains", body: params).perform
      end

      # GET /domains/:id: includes records[] with per-record status.
      def get(id)
        Posta::Request.new(method: :get, path: member_path(id)).perform
      end

      # GET /domains: accepts limit:/after:/before:.
      def list(options = {})
        Posta::Request.new(method: :get, path: "/domains", query: Posta::Util.list_query(options)).perform
      end

      # PATCH /domains/:id: open_tracking, click_tracking, tracking_subdomain
      # (nil or "" clears it).
      def update(id, params)
        Posta::Request.new(method: :patch, path: member_path(id), body: params).perform
      end

      # POST /domains/:id/verify: re-check DNS now.
      def verify(id)
        Posta::Request.new(method: :post, path: "#{member_path(id)}/verify").perform
      end

      # DELETE /domains/:id
      def remove(id)
        Posta::Request.new(method: :delete, path: member_path(id)).perform
      end

      private

      def member_path(id)
        "/domains/#{Posta::Util.encode(id)}"
      end
    end
  end
end

# frozen_string_literal: true

module Millionsend
  # Sending domains and their DNS records.
  module Domains
    class << self
      # POST /domains — name, region, custom_return_path, open_tracking,
      # click_tracking, tracking_subdomain. Returns the records to publish.
      def create(params)
        Millionsend::Request.new(method: :post, path: "/domains", body: params).perform
      end

      # GET /domains/:id — includes records[] with per-record status.
      def get(id)
        Millionsend::Request.new(method: :get, path: member_path(id)).perform
      end

      # GET /domains — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(method: :get, path: "/domains", query: Millionsend::Util.list_query(options)).perform
      end

      # PATCH /domains/:id — open_tracking, click_tracking, tracking_subdomain
      # (nil or "" clears it).
      def update(id, params)
        Millionsend::Request.new(method: :patch, path: member_path(id), body: params).perform
      end

      # POST /domains/:id/verify — re-check DNS now.
      def verify(id)
        Millionsend::Request.new(method: :post, path: "#{member_path(id)}/verify").perform
      end

      # DELETE /domains/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: member_path(id)).perform
      end

      private

      def member_path(id)
        "/domains/#{Millionsend::Util.encode(id)}"
      end
    end
  end
end

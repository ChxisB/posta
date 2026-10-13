# frozen_string_literal: true

module Millionsend
  # Suppression list — addresses the API refuses to send to. Entries are
  # addressable by id or by email.
  module Suppressions
    class << self
      # POST /suppressions — email, origin ("manual" default, "bounce",
      # "complaint", "unsubscribe"). Adding an already suppressed address
      # returns the existing entry.
      def add(params)
        Millionsend::Request.new(method: :post, path: "/suppressions", body: params).perform
      end
      alias_method :create, :add

      # GET /suppressions — accepts limit:/after:/before: and origin:.
      def list(options = {})
        query = Millionsend::Util.list_query(options).merge(origin: options[:origin])
        Millionsend::Request.new(method: :get, path: "/suppressions", query: query).perform
      end

      # GET /suppressions/:id_or_email
      def get(id_or_email)
        Millionsend::Request.new(method: :get, path: member_path(id_or_email)).perform
      end

      # DELETE /suppressions/:id_or_email — allows sending to that address again.
      def remove(id_or_email)
        Millionsend::Request.new(method: :delete, path: member_path(id_or_email)).perform
      end

      private

      def member_path(id_or_email)
        "/suppressions/#{Millionsend::Util.encode(id_or_email)}"
      end
    end

    # Up to 1000 suppressions per call.
    module Batch
      class << self
        # POST /suppressions/batch/add — { emails: [...], origin: }.
        def add(params)
          Millionsend::Request.new(method: :post, path: "/suppressions/batch/add", body: params).perform
        end

        # POST /suppressions/batch/remove — { emails: [...] } or { ids: [...] }.
        def remove(params)
          Millionsend::Request.new(method: :post, path: "/suppressions/batch/remove", body: params).perform
        end
      end
    end
  end
end

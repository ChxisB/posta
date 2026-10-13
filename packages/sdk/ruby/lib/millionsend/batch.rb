# frozen_string_literal: true

module Millionsend
  # Send up to 100 emails in a single call.
  module Batch
    class << self
      # POST /emails/batch with a bare array body. The trailing hash carries
      # idempotency_key and batch_validation ("strict", the default, rejects the
      # whole batch on one invalid item; "permissive" sends the valid subset and
      # lists the rest under errors[]) — either flat or under options:, like
      # Emails.send.
      def send(list, options = {})
        Millionsend::Request.new(
          method: :post, path: "/emails/batch", body: list, **Millionsend::Util.request_options(options)
        ).perform
      end
      alias_method :create, :send
    end
  end
end

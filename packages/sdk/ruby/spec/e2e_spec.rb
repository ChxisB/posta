# frozen_string_literal: true

# Opt-in end-to-end smoke test against a real MillionSend instance. The whole
# group only runs when MILLIONSEND_API_KEY is set; otherwise it is skipped. Set
# MILLIONSEND_BASE_URL too for a self-hosted instance (the default is MillionSend
# Cloud). It exercises the contact lifecycle, which needs no verified sender
# domain.
#
#   MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 \
#     bundle exec rspec spec/e2e_spec.rb
RSpec.describe "e2e: contacts lifecycle", :e2e, if: ENV["MILLIONSEND_API_KEY"] do
  before(:all) do
    WebMock.allow_net_connect!
    Millionsend.api_key = ENV["MILLIONSEND_API_KEY"]
    Millionsend.base_url = ENV["MILLIONSEND_BASE_URL"]
  end

  after(:all) do
    WebMock.disable_net_connect!
  end

  it "creates, reads, updates and deletes a contact" do
    email = "sdk-e2e-#{Time.now.to_i}@example.com"
    created = Millionsend::Contacts.create(email: email, first_name: "Ada")
    expect(created[:id]).not_to be_nil

    fetched = Millionsend::Contacts.get(email)
    expect(fetched[:email]).to eq(email)
    expect(fetched[:first_name]).to eq("Ada")

    Millionsend::Contacts.update(email: email, unsubscribed: true)

    removed = Millionsend::Contacts.remove(email)
    expect(removed[:deleted]).to eq(true)
  end

  it "raises not_found for a missing contact" do
    expect { Millionsend::Contacts.get("does-not-exist@example.com") }
      .to raise_error(Millionsend::NotFoundError)
  end
end

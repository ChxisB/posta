defmodule MillionSend.ResourcesTest do
  use ExUnit.Case, async: true

  import MillionSend.Test.Helpers

  setup do
    {:ok, client: client()}
  end

  describe "emails" do
    test "get and cancel hit the right paths", %{client: c} do
      assert {:ok, _} = MillionSend.Emails.get(c, "e1")
      assert req_method() == :get
      assert req_path() == "/emails/e1"

      assert {:ok, _} = MillionSend.Emails.cancel(c, "e1")
      assert req_method() == :post
      assert req_path() == "/emails/e1/cancel"
    end

    test "send puts every field on the wire, exactly as given", %{client: c} do
      params = %{
        from: "Acme <onboarding@acme.dev>",
        to: ["a@x.dev", "b@x.dev"],
        subject: "Hello",
        html: "<p>hi</p>",
        text: "hi",
        cc: "cc@x.dev",
        bcc: ["bcc@x.dev"],
        reply_to: ["r@x.dev"],
        scheduled_at: "in 2 hours",
        tags: [%{name: "campaign", value: "welcome"}],
        topic_id: "11111111-1111-1111-1111-111111111111",
        attachments: [
          %{
            filename: "hi.txt",
            content: Base.encode64("hi"),
            content_type: "text/plain",
            content_id: "cid-1",
            path: "hi.txt"
          }
        ],
        headers: %{"X-Entity-Ref-ID" => "42"},
        template: %{id: "t1", variables: %{name: "Ada"}}
      }

      assert {:ok, _} = MillionSend.Emails.send(c, params)
      assert req_method() == :post and req_path() == "/emails"

      assert req_body() == %{
               "from" => "Acme <onboarding@acme.dev>",
               "to" => ["a@x.dev", "b@x.dev"],
               "subject" => "Hello",
               "html" => "<p>hi</p>",
               "text" => "hi",
               "cc" => "cc@x.dev",
               "bcc" => ["bcc@x.dev"],
               "reply_to" => ["r@x.dev"],
               "scheduled_at" => "in 2 hours",
               "tags" => [%{"name" => "campaign", "value" => "welcome"}],
               "topic_id" => "11111111-1111-1111-1111-111111111111",
               "attachments" => [
                 %{
                   "filename" => "hi.txt",
                   "content" => Base.encode64("hi"),
                   "content_type" => "text/plain",
                   "content_id" => "cid-1",
                   "path" => "hi.txt"
                 }
               ],
               "headers" => %{"X-Entity-Ref-ID" => "42"},
               "template" => %{"id" => "t1", "variables" => %{"name" => "Ada"}}
             }
    end

    test "string keys and explicit nils reach the wire too", %{client: c} do
      assert {:ok, _} =
               MillionSend.Emails.send(c, %{
                 "from" => "a@x.dev",
                 "to" => "b@x.dev",
                 "subject" => "s",
                 "text" => "t",
                 "topic_id" => nil
               })

      assert req_body() == %{
               "from" => "a@x.dev",
               "to" => "b@x.dev",
               "subject" => "s",
               "text" => "t",
               "topic_id" => nil
             }
    end

    test "list, update and remove", %{client: c} do
      stub_json(%{"object" => "list", "has_more" => false, "data" => [%{"id" => "e1"}]})

      assert {:ok, %MillionSend.List{data: [%MillionSend.Emails.Email{id: "e1"}]}} =
               MillionSend.Emails.list(c, limit: 10, after: "cur")

      assert req_method() == :get and req_path() == "/emails"
      assert req_query() == "limit=10&after=cur"

      assert {:ok, _} = MillionSend.Emails.update(c, "e1", scheduled_at: "in 1 day")
      assert req_method() == :patch and req_path() == "/emails/e1"
      assert req_body() == %{"scheduled_at" => "in 1 day"}

      assert {:ok, _} = MillionSend.Emails.update(c, "e1", %{scheduled_at: "in 2 days"})
      assert req_body() == %{"scheduled_at" => "in 2 days"}

      stub_json(%{"object" => "email", "id" => "e1", "deleted" => true})
      assert {:ok, %MillionSend.Emails.Email{deleted: true}} = MillionSend.Emails.remove(c, "e1")
      assert req_method() == :delete and req_path() == "/emails/e1"
    end

    test "get carries the score field, present or null", %{client: c} do
      stub_json(%{"object" => "email", "id" => "e1", "score" => 8.5})
      assert {:ok, %MillionSend.Emails.Email{score: 8.5}} = MillionSend.Emails.get(c, "e1")

      stub_json(%{"object" => "email", "id" => "e1", "score" => nil})
      assert {:ok, %MillionSend.Emails.Email{score: nil}} = MillionSend.Emails.get(c, "e1")
    end
  end

  describe "insights" do
    test "get_insights casts the full report, checks with and without detail", %{client: c} do
      stub_json(%{
        "object" => "email_insights",
        "email_id" => "e1",
        "score" => 8.5,
        "score_version" => 1,
        "band" => "excellent",
        "marketing" => true,
        "html_size_bytes" => 12_345,
        "computed_at" => "2026-08-31T00:00:00.000Z",
        "checks" => [
          %{
            "id" => "list_unsubscribe",
            "severity" => "critical",
            "status" => "fail",
            "penalty" => 1.25,
            "detail" => %{"header" => "List-Unsubscribe", "found" => false}
          },
          %{"id" => "plain_text_part", "severity" => "minor", "status" => "pass", "penalty" => 0}
        ]
      })

      assert {:ok, insights} = MillionSend.Emails.get_insights(c, "e1")
      assert req_method() == :get
      assert req_path() == "/emails/e1/insights"

      assert %MillionSend.Emails.Insights{
               object: "email_insights",
               email_id: "e1",
               score: 8.5,
               score_version: 1,
               band: "excellent",
               marketing: true,
               html_size_bytes: 12_345,
               computed_at: "2026-08-31T00:00:00.000Z"
             } = insights

      assert [failed, passed] = insights.checks

      assert %MillionSend.Emails.Insights.Check{
               id: "list_unsubscribe",
               severity: "critical",
               status: "fail",
               penalty: 1.25,
               detail: %{"header" => "List-Unsubscribe", "found" => false}
             } = failed

      assert %MillionSend.Emails.Insights.Check{
               id: "plain_text_part",
               severity: "minor",
               status: "pass",
               penalty: 0,
               detail: nil
             } = passed
    end

    test "unknown future band/severity/status values pass through as strings", %{client: c} do
      stub_json(%{
        "object" => "email_insights",
        "email_id" => "e1",
        "score" => 5.0,
        "score_version" => 9,
        "band" => "stellar",
        "marketing" => false,
        "html_size_bytes" => nil,
        "computed_at" => "2026-08-31T00:00:00.000Z",
        "checks" => [
          %{
            "id" => "brand_new_check",
            "severity" => "cosmic",
            "status" => "deferred",
            "penalty" => 0
          }
        ]
      })

      assert {:ok, insights} = MillionSend.Emails.get_insights(c, "e1")
      assert insights.band == "stellar"
      assert [%{id: "brand_new_check", severity: "cosmic", status: "deferred"}] = insights.checks
    end

    test "404 surfaces as a not_found error", %{client: c} do
      stub_response(404, %{
        "statusCode" => 404,
        "name" => "not_found",
        "message" => "Insights not available"
      })

      assert {:error, %MillionSend.Error{status_code: 404, name: "not_found"}} =
               MillionSend.Emails.get_insights(c, "missing")
    end
  end

  describe "deliverability" do
    test "get casts the full account report", %{client: c} do
      stub_json(%{
        "object" => "deliverability",
        "score" => 8.7,
        "band" => "good",
        "content_score" => 8.2,
        "outcome_score" => 9.1,
        "complaint_rate" => 0.0002,
        "hard_bounce_rate" => 0.001,
        "emails_sent" => 12_345,
        "scored_recipients" => 23_456,
        "window_days" => 30,
        "insufficient_outcome_data" => false,
        "guardrail_status" => "ok",
        "score_version" => 1
      })

      assert {:ok, report} = MillionSend.Deliverability.get(c)
      assert req_method() == :get
      assert req_path() == "/deliverability"

      assert %MillionSend.Deliverability{
               object: "deliverability",
               score: 8.7,
               band: "good",
               content_score: 8.2,
               outcome_score: 9.1,
               complaint_rate: 0.0002,
               hard_bounce_rate: 0.001,
               emails_sent: 12_345,
               scored_recipients: 23_456,
               window_days: 30,
               insufficient_outcome_data: false,
               guardrail_status: "ok",
               score_version: 1
             } = report
    end

    test "null scores stay nil; unknown guardrail_status stays a string", %{client: c} do
      stub_json(%{
        "object" => "deliverability",
        "score" => nil,
        "band" => nil,
        "content_score" => nil,
        "outcome_score" => nil,
        "complaint_rate" => 0.0,
        "hard_bounce_rate" => 0.0,
        "emails_sent" => 0,
        "scored_recipients" => 0,
        "window_days" => 30,
        "insufficient_outcome_data" => true,
        "guardrail_status" => "quarantined",
        "score_version" => 1
      })

      assert {:ok, report} = MillionSend.Deliverability.get(c)
      assert report.score == nil
      assert report.band == nil
      assert report.content_score == nil
      assert report.outcome_score == nil
      assert report.insufficient_outcome_data == true
      assert report.guardrail_status == "quarantined"
    end
  end

  describe "batch" do
    test "sends a bare array body with an idempotency key", %{client: c} do
      stub_json(%{"data" => [%{"id" => "1"}, %{"id" => "2"}]})

      assert {:ok, [a, b]} =
               MillionSend.Emails.send_batch(
                 c,
                 [
                   %{from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one"},
                   %{from: "a@x.dev", to: "c@x.dev", subject: "2", text: "two"}
                 ],
                 idempotency_key: "batch-1"
               )

      assert req_path() == "/emails/batch"
      assert is_list(req_body())
      assert length(req_body()) == 2
      assert req_headers()["idempotency-key"] == "batch-1"
      refute Map.has_key?(req_headers(), "x-batch-validation")
      assert a.id == "1" and b.id == "2"
    end

    test "items keep every field", %{client: c} do
      item = %{
        from: "a@x.dev",
        to: "b@x.dev",
        subject: "1",
        html: "<p>1</p>",
        tags: [%{name: "k", value: "v"}],
        headers: %{"X-Ref" => "1"},
        attachments: [%{filename: "a.txt", content: "aGk="}],
        topic_id: nil
      }

      assert {:ok, _} = MillionSend.Emails.send_batch(c, [item])

      assert req_body() == [
               %{
                 "from" => "a@x.dev",
                 "to" => "b@x.dev",
                 "subject" => "1",
                 "html" => "<p>1</p>",
                 "tags" => [%{"name" => "k", "value" => "v"}],
                 "headers" => %{"X-Ref" => "1"},
                 "attachments" => [%{"filename" => "a.txt", "content" => "aGk="}],
                 "topic_id" => nil
               }
             ]
    end

    test "strict validation sends the header and keeps the list shape", %{client: c} do
      stub_json(%{"data" => [%{"id" => "1"}]})

      assert {:ok, [%MillionSend.Emails.Email{id: "1"}]} =
               MillionSend.Emails.send_batch(
                 c,
                 [%{from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one"}],
                 batch_validation: :strict
               )

      assert req_headers()["x-batch-validation"] == "strict"
    end

    test "permissive validation sends the header and returns typed errors", %{client: c} do
      stub_json(%{
        "data" => [%{"id" => "1"}],
        "errors" => [%{"index" => 1, "message" => "to: invalid email"}]
      })

      assert {:ok, %MillionSend.Emails.BatchResponse{} = response} =
               MillionSend.Emails.send_batch(
                 c,
                 [
                   %{from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one"},
                   %{from: "a@x.dev", to: "nope", subject: "2", text: "two"}
                 ],
                 batch_validation: "permissive",
                 idempotency_key: "batch-2"
               )

      assert req_headers()["x-batch-validation"] == "permissive"
      assert req_headers()["idempotency-key"] == "batch-2"
      assert [%MillionSend.Emails.Email{id: "1"}] = response.data
      assert [%MillionSend.BatchError{index: 1, message: "to: invalid email"}] = response.errors
    end
  end

  describe "contacts" do
    test "creates at the top-level collection", %{client: c} do
      assert {:ok, _} =
               MillionSend.Contacts.create(c, %{email: "c@x.dev", first_name: "Ada"})

      assert req_method() == :post and req_path() == "/contacts"
      assert req_body() == %{"email" => "c@x.dev", "first_name" => "Ada"}
    end

    test "create passes every field through", %{client: c} do
      assert {:ok, _} =
               MillionSend.Contacts.create(c, %{
                 email: "c@x.dev",
                 first_name: "Ada",
                 last_name: "Lovelace",
                 unsubscribed: false,
                 properties: %{plan: "pro", seats: 3},
                 segments: [%{id: "s1"}],
                 topics: [%{id: "t1", subscription: :opt_in}]
               })

      assert req_body() == %{
               "email" => "c@x.dev",
               "first_name" => "Ada",
               "last_name" => "Lovelace",
               "unsubscribed" => false,
               "properties" => %{"plan" => "pro", "seats" => 3},
               "segments" => [%{"id" => "s1"}],
               "topics" => [%{"id" => "t1", "subscription" => "opt_in"}]
             }
    end

    test "create_batch posts the array with on_conflict and the validation header", %{client: c} do
      stub_json(%{
        "data" => [
          %{"object" => "contact", "index" => 0, "id" => "c1", "status" => "created"},
          %{"object" => "contact", "index" => 2, "id" => "c2", "status" => "skipped"}
        ],
        "counts" => %{"created" => 1, "updated" => 0, "skipped" => 1, "failed" => 1},
        "errors" => [%{"index" => 1, "message" => "email: invalid"}]
      })

      assert {:ok, %MillionSend.Contacts.BatchResponse{} = response} =
               MillionSend.Contacts.create_batch(
                 c,
                 [%{email: "a@x.dev"}, %{email: "nope"}, %{email: "b@x.dev"}],
                 on_conflict: :skip,
                 batch_validation: :permissive
               )

      assert req_method() == :post and req_path() == "/contacts/batch"
      assert req_query() == "on_conflict=skip"
      assert req_headers()["x-batch-validation"] == "permissive"

      assert req_body() == [
               %{"email" => "a@x.dev"},
               %{"email" => "nope"},
               %{"email" => "b@x.dev"}
             ]

      assert [
               %MillionSend.Contacts.BatchResponse.Item{index: 0, id: "c1", status: "created"},
               %MillionSend.Contacts.BatchResponse.Item{index: 2, id: "c2", status: "skipped"}
             ] = response.data

      assert response.counts == %{created: 1, updated: 0, skipped: 1, failed: 1}
      assert [%MillionSend.BatchError{index: 1, message: "email: invalid"}] = response.errors
    end

    test "create_batch defaults send no query and no header", %{client: c} do
      stub_json(%{"data" => [], "counts" => %{"created" => 0}})

      assert {:ok, %MillionSend.Contacts.BatchResponse{errors: [], counts: counts}} =
               MillionSend.Contacts.create_batch(c, [%{email: "a@x.dev"}])

      assert req_query() == nil
      refute Map.has_key?(req_headers(), "x-batch-validation")
      assert counts == %{created: 0, updated: 0, skipped: 0, failed: 0}
    end

    test "addresses by string id and by email", %{client: c} do
      assert {:ok, _} = MillionSend.Contacts.get(c, "c1")
      assert req_path() == "/contacts/c1"

      assert {:ok, _} = MillionSend.Contacts.get(c, %{email: "c@x.dev"})
      assert req_path() == "/contacts/c%40x.dev"
    end

    test "email wins over id when both are given", %{client: c} do
      assert {:ok, _} = MillionSend.Contacts.get(c, %{id: "c1", email: "c@x.dev"})
      assert req_path() == "/contacts/c%40x.dev"
    end

    test "update sends only provided keys (nil clears)", %{client: c} do
      assert {:ok, _} =
               MillionSend.Contacts.update(c, %{id: "c1", first_name: nil, unsubscribed: true})

      assert req_method() == :patch and req_path() == "/contacts/c1"
      assert req_body() == %{"first_name" => nil, "unsubscribed" => true}
    end

    test "update by email keeps the address out of the body", %{client: c} do
      assert {:ok, _} =
               MillionSend.Contacts.update(c, %{
                 "email" => "c@x.dev",
                 "last_name" => nil,
                 "properties" => %{"plan" => nil}
               })

      assert req_path() == "/contacts/c%40x.dev"
      assert req_body() == %{"last_name" => nil, "properties" => %{"plan" => nil}}
    end

    test "remove and list", %{client: c} do
      assert {:ok, _} = MillionSend.Contacts.remove(c, %{email: "c@x.dev"})
      assert req_method() == :delete
      assert req_query() == nil

      assert {:ok, _} = MillionSend.Contacts.remove(c, "c1", erase: true)
      assert req_method() == :delete and req_path() == "/contacts/c1"
      assert req_query() == "erase=true"

      assert {:ok, %MillionSend.List{}} = MillionSend.Contacts.list(c, after: "cur")
      assert req_path() == "/contacts"
      assert req_query() == "after=cur"
    end

    test "list passes include as a comma-separated list and casts the extra fields", %{client: c} do
      stub_json(%{
        "object" => "list",
        "has_more" => false,
        "data" => [
          %{
            "id" => "c1",
            "email" => "c@x.dev",
            "properties" => %{"plan" => %{"type" => "string", "value" => "pro"}},
            "topics" => [
              %{
                "id" => "t1",
                "name" => "Insights",
                "description" => nil,
                "subscription" => "opt_in",
                "explicit" => true,
                "visibility" => "public"
              }
            ]
          }
        ]
      })

      assert {:ok, %MillionSend.List{data: [contact]}} =
               MillionSend.Contacts.list(c, limit: 100, include: [:properties, :topics])

      assert req_path() == "/contacts"
      assert req_query() == "limit=100&include=properties%2Ctopics"

      assert %MillionSend.Contacts.Contact{
               id: "c1",
               properties: %{"plan" => %{"type" => "string", "value" => "pro"}},
               topics: [
                 %MillionSend.Contacts.TopicSubscription{
                   id: "t1",
                   name: "Insights",
                   subscription: "opt_in",
                   explicit: true,
                   visibility: "public"
                 }
               ]
             } = contact

      stub_json(%{"object" => "list", "has_more" => false, "data" => [%{"id" => "c1"}]})

      assert {:ok, %MillionSend.List{data: [%MillionSend.Contacts.Contact{topics: nil}]}} =
               MillionSend.Contacts.list(c)

      assert req_query() == nil
    end

    test "list_topics gets /contacts/:email/topics and casts the subscriptions", %{client: c} do
      stub_json(%{
        "object" => "list",
        "has_more" => false,
        "data" => [
          %{
            "id" => "t1",
            "name" => "Insights",
            "description" => nil,
            "subscription" => "opt_in",
            "explicit" => true,
            "visibility" => "public"
          },
          %{
            "id" => "t2",
            "name" => "Digest",
            "description" => "Monthly",
            "subscription" => "opt_out",
            "explicit" => false,
            "visibility" => "private"
          }
        ]
      })

      assert {:ok, %MillionSend.List{has_more: false, data: topics}} =
               MillionSend.Contacts.list_topics(c, %{email: "c@x.dev"})

      assert req_method() == :get and req_path() == "/contacts/c%40x.dev/topics"
      assert req_body() == nil

      assert topics == [
               %MillionSend.Contacts.TopicSubscription{
                 id: "t1",
                 name: "Insights",
                 description: nil,
                 subscription: "opt_in",
                 explicit: true,
                 visibility: "public"
               },
               %MillionSend.Contacts.TopicSubscription{
                 id: "t2",
                 name: "Digest",
                 description: "Monthly",
                 subscription: "opt_out",
                 explicit: false,
                 visibility: "private"
               }
             ]

      assert {:ok, _} = MillionSend.Contacts.list_topics(c, "c1")
      assert req_path() == "/contacts/c1/topics"
    end

    test "update_topics patches /contacts/:id/topics with the bare array", %{client: c} do
      stub_json(%{"id" => "c1"})

      assert {:ok, _} =
               MillionSend.Contacts.update_topics(c, %{
                 id: "c1",
                 topics: [%{id: "t1", subscription: "opt_out"}]
               })

      assert req_method() == :patch and req_path() == "/contacts/c1/topics"
      assert req_body() == [%{"id" => "t1", "subscription" => "opt_out"}]
    end

    test "add_to_segment and remove_from_segment", %{client: c} do
      assert {:ok, _} = MillionSend.Contacts.add_to_segment(c, %{email: "c@x.dev"}, "s1")
      assert req_method() == :post and req_path() == "/contacts/c%40x.dev/segments/s1"
      assert req_body() == nil

      stub_json(%{"id" => "c1", "deleted" => true})

      assert {:ok, %MillionSend.Contacts.Contact{deleted: true}} =
               MillionSend.Contacts.remove_from_segment(c, "c1", "s1")

      assert req_method() == :delete and req_path() == "/contacts/c1/segments/s1"
    end

    test "batch_get posts ids and emails to /contacts/batch/get and casts missing", %{client: c} do
      stub_json(%{
        "object" => "list",
        "data" => [
          %{
            "object" => "contact",
            "id" => "c1",
            "email" => "a@x.dev",
            "topics" => [%{"id" => "t1", "subscription" => "opt_out", "explicit" => false}]
          }
        ],
        "missing" => [%{"index" => 1, "email" => "b@x.dev"}]
      })

      assert {:ok, %MillionSend.Contacts.BatchGetResponse{data: [contact], missing: missing}} =
               MillionSend.Contacts.batch_get(c, ["c1", %{email: "b@x.dev"}],
                 include: [:properties, :topics]
               )

      assert req_method() == :post and req_path() == "/contacts/batch/get"
      assert req_query() == nil

      assert req_body() == %{
               "contacts" => [%{"id" => "c1"}, %{"email" => "b@x.dev"}],
               "include" => ["properties", "topics"]
             }

      assert %MillionSend.Contacts.Contact{
               id: "c1",
               topics: [
                 %MillionSend.Contacts.TopicSubscription{id: "t1", subscription: "opt_out"}
               ]
             } = contact

      assert [%MillionSend.Contacts.BatchGetResponse.Missing{index: 1, id: nil, email: "b@x.dev"}] =
               missing

      stub_json(%{"object" => "list", "data" => [%{"id" => "c2"}], "missing" => []})

      assert {:ok, %MillionSend.Contacts.BatchGetResponse{missing: []}} =
               MillionSend.Contacts.batch_get(c, [%{id: "c2"}])

      assert req_body() == %{"contacts" => [%{"id" => "c2"}]}
    end

    test "batch_remove posts ids or emails and casts the deleted rows", %{client: c} do
      stub_json(%{"data" => [%{"object" => "contact", "contact" => "c1", "deleted" => true}]})

      assert {:ok, [%MillionSend.Contacts.Contact{contact: "c1", deleted: true}]} =
               MillionSend.Contacts.batch_remove(c, %{emails: ["a@x.dev", "b@x.dev"]})

      assert req_method() == :post and req_path() == "/contacts/batch/remove"
      assert req_body() == %{"emails" => ["a@x.dev", "b@x.dev"]}

      assert {:ok, _} = MillionSend.Contacts.batch_remove(c, %{ids: ["c1", "c2"]})
      assert req_body() == %{"ids" => ["c1", "c2"]}

      assert {:ok, _} = MillionSend.Contacts.batch_remove(c, %{ids: ["c1"], erase: true})
      assert req_body() == %{"ids" => ["c1"], "erase" => true}
    end

    test "preferences_link posts to /contacts/:id_or_email/preferences-link", %{client: c} do
      stub_json(%{
        "object" => "preferences_link",
        "contact" => "c1",
        "url" => "https://app.test/p/tok"
      })

      assert {:ok,
              %MillionSend.Contacts.PreferencesLink{
                object: "preferences_link",
                contact: "c1",
                url: "https://app.test/p/tok"
              }} = MillionSend.Contacts.preferences_link(c, %{email: "c@x.dev"})

      assert req_method() == :post and req_path() == "/contacts/c%40x.dev/preferences-link"
      assert req_body() == nil

      assert {:ok, _} = MillionSend.Contacts.preferences_link(c, "c1")
      assert req_path() == "/contacts/c1/preferences-link"

      stub_response(422, %{
        "statusCode" => 422,
        "name" => "validation_error",
        "message" => "APP_BASE_URL and MASTER_ENCRYPTION_KEY must be set to mint preference links"
      })

      assert {:error, %MillionSend.Error{name: "validation_error", status_code: 422}} =
               MillionSend.Contacts.preferences_link(c, "c1")
    end
  end

  describe "broadcasts" do
    test "covers the full lifecycle", %{client: c} do
      assert {:ok, _} =
               MillionSend.Broadcasts.create(c, %{
                 segment_id: "s1",
                 from: "a@x.dev",
                 subject: "News",
                 html: "<p>hi</p>"
               })

      assert req_path() == "/broadcasts"

      assert req_body() == %{
               "segment_id" => "s1",
               "from" => "a@x.dev",
               "subject" => "News",
               "html" => "<p>hi</p>"
             }

      assert {:ok, _} = MillionSend.Broadcasts.get(c, "b1")
      assert req_path() == "/broadcasts/b1"

      assert {:ok, %MillionSend.List{}} = MillionSend.Broadcasts.list(c)
      assert req_path() == "/broadcasts"

      assert {:ok, _} = MillionSend.Broadcasts.update(c, "b1", %{subject: "New"})
      assert req_method() == :patch and req_path() == "/broadcasts/b1"

      assert {:ok, _} = MillionSend.Broadcasts.send(c, "b1", scheduled_at: "2999-01-01T00:00:00Z")
      assert req_path() == "/broadcasts/b1/send"
      assert req_body() == %{"scheduled_at" => "2999-01-01T00:00:00Z"}

      assert {:ok, _} = MillionSend.Broadcasts.cancel(c, "b1")
      assert req_path() == "/broadcasts/b1/cancel"

      assert {:ok, _} = MillionSend.Broadcasts.remove(c, "b1")
      assert req_method() == :delete
    end

    test "create passes every field through, including send and scheduled_at", %{client: c} do
      assert {:ok, _} =
               MillionSend.Broadcasts.create(c, %{
                 name: "Launch",
                 segment_id: "s1",
                 from: "a@x.dev",
                 subject: "News",
                 html: "<p>hi</p>",
                 text: "hi",
                 reply_to: ["r@x.dev"],
                 preview_text: "Preview",
                 topic_id: "t1",
                 send: true,
                 scheduled_at: "in 1 hour"
               })

      assert req_body() == %{
               "name" => "Launch",
               "segment_id" => "s1",
               "from" => "a@x.dev",
               "subject" => "News",
               "html" => "<p>hi</p>",
               "text" => "hi",
               "reply_to" => ["r@x.dev"],
               "preview_text" => "Preview",
               "topic_id" => "t1",
               "send" => true,
               "scheduled_at" => "in 1 hour"
             }
    end

    test "update clears the topic with an explicit null", %{client: c} do
      assert {:ok, _} =
               MillionSend.Broadcasts.update(c, "b1", %{topic_id: nil, preview_text: "New"})

      assert req_body() == %{"topic_id" => nil, "preview_text" => "New"}
    end

    test "send now posts an empty body", %{client: c} do
      assert {:ok, _} = MillionSend.Broadcasts.send(c, "b1")
      assert req_path() == "/broadcasts/b1/send"
      assert req_body() == %{}
    end
  end

  describe "topics" do
    test "covers create/get/list/update/remove", %{client: c} do
      assert {:ok, _} =
               MillionSend.Topics.create(c, %{
                 name: "Product",
                 default_subscription: "opt_in",
                 visibility: :public
               })

      assert req_body() == %{
               "name" => "Product",
               "default_subscription" => "opt_in",
               "visibility" => "public"
             }

      assert {:ok, _} = MillionSend.Topics.get(c, "t1")
      assert req_path() == "/topics/t1"

      stub_json(%{"data" => [%{"id" => "t1", "name" => "Product", "visibility" => "private"}]})
      assert {:ok, [topic]} = MillionSend.Topics.list(c)
      assert req_path() == "/topics"
      assert %MillionSend.Topics.Topic{id: "t1", visibility: "private"} = topic

      assert {:ok, _} = MillionSend.Topics.update(c, "t1", %{description: "News"})
      assert req_method() == :patch and req_path() == "/topics/t1"
      assert req_body() == %{"description" => "News"}

      assert {:ok, _} = MillionSend.Topics.remove(c, "t1")
      assert req_method() == :delete
    end
  end

  describe "segments" do
    test "covers create/get/list/update/remove on /segments", %{client: c} do
      filter = %{match: "all", conditions: [%{field: "email", op: "is_set"}]}

      assert {:ok, _} = MillionSend.Segments.create(c, %{name: "Active", filter: filter})

      assert req_path() == "/segments"

      assert req_body() == %{
               "name" => "Active",
               "filter" => %{
                 "match" => "all",
                 "conditions" => [%{"field" => "email", "op" => "is_set"}]
               }
             }

      assert {:ok, _} = MillionSend.Segments.get(c, "s1")
      assert req_path() == "/segments/s1"

      assert {:ok, %MillionSend.List{}} = MillionSend.Segments.list(c, before: "cur")
      assert req_path() == "/segments"
      assert req_query() == "before=cur"

      assert {:ok, _} = MillionSend.Segments.update(c, "s1", %{name: "Renamed"})
      assert req_method() == :patch and req_path() == "/segments/s1"

      assert {:ok, _} = MillionSend.Segments.remove(c, "s1")
      assert req_method() == :delete
    end

    test "list_contacts pages the segment's members", %{client: c} do
      stub_json(%{"object" => "list", "has_more" => true, "data" => [%{"id" => "c1"}]})

      assert {:ok, %MillionSend.List{has_more: true, data: [%MillionSend.Contacts.Contact{}]}} =
               MillionSend.Segments.list_contacts(c, "s1", limit: 5)

      assert req_method() == :get and req_path() == "/segments/s1/contacts"
      assert req_query() == "limit=5"

      assert {:ok, _} = MillionSend.Segments.list_contacts(c, "s1", include: [:topics])
      assert req_query() == "include=topics"
    end
  end

  describe "suppressions" do
    test "create/get/list/remove", %{client: c} do
      assert {:ok, _} =
               MillionSend.Suppressions.create(c, %{email: "gone@x.dev", origin: :manual})

      assert req_method() == :post and req_path() == "/suppressions"
      assert req_body() == %{"email" => "gone@x.dev", "origin" => "manual"}

      stub_json(%{
        "object" => "suppression",
        "id" => "sp1",
        "email" => "gone@x.dev",
        "origin" => "bounce",
        "source_id" => "e1",
        "created_at" => "2026-01-01"
      })

      assert {:ok, %MillionSend.Suppressions.Suppression{origin: "bounce", source_id: "e1"}} =
               MillionSend.Suppressions.get(c, "gone@x.dev")

      assert req_method() == :get and req_path() == "/suppressions/gone%40x.dev"

      assert {:ok, %MillionSend.List{}} =
               MillionSend.Suppressions.list(c, limit: 2, origin: :bounce)

      assert req_path() == "/suppressions"
      assert req_query() == "limit=2&origin=bounce"

      stub_json(%{"object" => "suppression", "id" => "sp1", "deleted" => true})

      assert {:ok, %MillionSend.Suppressions.Suppression{id: "sp1", deleted: true}} =
               MillionSend.Suppressions.remove(c, "sp1")

      assert req_method() == :delete and req_path() == "/suppressions/sp1"
    end

    test "batch_add and batch_remove", %{client: c} do
      stub_json(%{"data" => [%{"object" => "suppression", "id" => "sp1"}]})

      assert {:ok, [%MillionSend.Suppressions.Suppression{id: "sp1"}]} =
               MillionSend.Suppressions.batch_add(c, ["a@x.dev", "b@x.dev"], origin: :unsubscribe)

      assert req_method() == :post and req_path() == "/suppressions/batch/add"
      assert req_body() == %{"emails" => ["a@x.dev", "b@x.dev"], "origin" => "unsubscribe"}

      assert {:ok, _} = MillionSend.Suppressions.batch_add(c, ["a@x.dev"])
      assert req_body() == %{"emails" => ["a@x.dev"]}

      stub_json(%{"data" => [%{"object" => "suppression", "id" => "sp1", "deleted" => true}]})

      assert {:ok, [%MillionSend.Suppressions.Suppression{deleted: true}]} =
               MillionSend.Suppressions.batch_remove(c, %{emails: ["a@x.dev"]})

      assert req_method() == :post and req_path() == "/suppressions/batch/remove"
      assert req_body() == %{"emails" => ["a@x.dev"]}

      assert {:ok, _} = MillionSend.Suppressions.batch_remove(c, %{ids: ["sp1", "sp2"]})
      assert req_body() == %{"ids" => ["sp1", "sp2"]}
    end
  end

  describe "domains" do
    test "create/list/get/verify/update/remove", %{client: c} do
      stub_json(%{
        "id" => "d1",
        "name" => "acme.dev",
        "status" => "pending",
        "region" => "us-east-1",
        "open_tracking" => true,
        "click_tracking" => false,
        "tracking_subdomain" => "links",
        "capabilities" => %{"sending" => "enabled", "receiving" => "disabled"},
        "records" => [
          %{
            "record" => "DKIM",
            "name" => "x._domainkey",
            "type" => "TXT",
            "ttl" => "Auto",
            "status" => "pending",
            "value" => "v=DKIM1"
          },
          %{
            "record" => "MX",
            "name" => "send",
            "type" => "MX",
            "ttl" => "Auto",
            "status" => "pending",
            "value" => "feedback-smtp.amazonses.com",
            "priority" => 10
          }
        ]
      })

      assert {:ok, %MillionSend.Domains.Domain{} = domain} =
               MillionSend.Domains.create(c, %{
                 name: "acme.dev",
                 region: "us-east-1",
                 custom_return_path: "send",
                 open_tracking: true,
                 click_tracking: false,
                 tracking_subdomain: "links"
               })

      assert req_method() == :post and req_path() == "/domains"

      assert req_body() == %{
               "name" => "acme.dev",
               "region" => "us-east-1",
               "custom_return_path" => "send",
               "open_tracking" => true,
               "click_tracking" => false,
               "tracking_subdomain" => "links"
             }

      assert domain.tracking_subdomain == "links"
      assert domain.capabilities == %{"sending" => "enabled", "receiving" => "disabled"}

      assert [
               %MillionSend.Domains.Domain.Record{record: "DKIM", type: "TXT", priority: nil},
               %MillionSend.Domains.Domain.Record{record: "MX", priority: 10}
             ] = domain.records

      stub_json(%{"object" => "list", "has_more" => false, "data" => [%{"id" => "d1"}]})

      assert {:ok, %MillionSend.List{data: [%MillionSend.Domains.Domain{id: "d1", records: []}]}} =
               MillionSend.Domains.list(c, limit: 1)

      assert req_method() == :get and req_path() == "/domains"
      assert req_query() == "limit=1"

      stub_json(%{"object" => "domain", "id" => "d1", "records" => []})
      assert {:ok, %MillionSend.Domains.Domain{id: "d1"}} = MillionSend.Domains.get(c, "d1")
      assert req_method() == :get and req_path() == "/domains/d1"

      assert {:ok, %MillionSend.Domains.Domain{}} = MillionSend.Domains.verify(c, "d1")
      assert req_method() == :post and req_path() == "/domains/d1/verify"
      assert req_body() == nil

      assert {:ok, _} =
               MillionSend.Domains.update(c, "d1", %{
                 open_tracking: true,
                 click_tracking: true,
                 tracking_subdomain: nil
               })

      assert req_method() == :patch and req_path() == "/domains/d1"

      assert req_body() == %{
               "open_tracking" => true,
               "click_tracking" => true,
               "tracking_subdomain" => nil
             }

      stub_json(%{"object" => "domain", "id" => "d1", "deleted" => true})

      assert {:ok, %MillionSend.Domains.Domain{deleted: true}} =
               MillionSend.Domains.remove(c, "d1")

      assert req_method() == :delete and req_path() == "/domains/d1"
    end
  end

  describe "api keys" do
    test "create returns the one-time token; list and remove", %{client: c} do
      stub_json(%{"id" => "k1", "token" => "ms_secret"})

      assert {:ok, %MillionSend.ApiKeys.ApiKey{id: "k1", token: "ms_secret"}} =
               MillionSend.ApiKeys.create(c, %{
                 name: "ci",
                 permission: :sending_access,
                 domain_id: "d1"
               })

      assert req_method() == :post and req_path() == "/api-keys"

      assert req_body() == %{
               "name" => "ci",
               "permission" => "sending_access",
               "domain_id" => "d1"
             }

      stub_json(%{
        "object" => "list",
        "has_more" => false,
        "data" => [%{"id" => "k1", "name" => "ci", "last_used_at" => nil}]
      })

      assert {:ok, %MillionSend.List{data: [%MillionSend.ApiKeys.ApiKey{name: "ci"}]}} =
               MillionSend.ApiKeys.list(c)

      assert req_method() == :get and req_path() == "/api-keys"

      stub_json(%{"object" => "api_key", "id" => "k1", "deleted" => true})

      assert {:ok, %MillionSend.ApiKeys.ApiKey{deleted: true}} =
               MillionSend.ApiKeys.remove(c, "k1")

      assert req_method() == :delete and req_path() == "/api-keys/k1"
    end
  end

  describe "webhooks" do
    test "create/list/get/update/remove", %{client: c} do
      stub_json(%{"object" => "webhook", "id" => "w1", "signing_secret" => "whsec_abc"})

      assert {:ok, %MillionSend.Webhooks.Webhook{id: "w1", signing_secret: "whsec_abc"}} =
               MillionSend.Webhooks.create(c, %{
                 endpoint: "https://acme.dev/hook",
                 events: ["email.delivered", "email.bounced"],
                 signing_secret: "whsec_abc"
               })

      assert req_method() == :post and req_path() == "/webhooks"

      assert req_body() == %{
               "endpoint" => "https://acme.dev/hook",
               "events" => ["email.delivered", "email.bounced"],
               "signing_secret" => "whsec_abc"
             }

      assert {:ok, %MillionSend.List{}} = MillionSend.Webhooks.list(c, after: "w0")
      assert req_method() == :get and req_path() == "/webhooks"
      assert req_query() == "after=w0"

      stub_json(%{
        "object" => "webhook",
        "id" => "w1",
        "endpoint" => "https://acme.dev/hook",
        "events" => ["email.delivered"],
        "status" => "enabled",
        "signing_secret" => "whsec_abc",
        "previous_secret_expires_at" => nil
      })

      assert {:ok,
              %MillionSend.Webhooks.Webhook{
                status: "enabled",
                signing_secret: "whsec_abc",
                previous_secret_expires_at: nil
              }} = MillionSend.Webhooks.get(c, "w1")

      assert req_method() == :get and req_path() == "/webhooks/w1"

      assert {:ok, _} =
               MillionSend.Webhooks.update(c, "w1", %{status: :disabled, events: ["email.sent"]})

      assert req_method() == :patch and req_path() == "/webhooks/w1"
      assert req_body() == %{"status" => "disabled", "events" => ["email.sent"]}

      stub_json(%{"object" => "webhook", "id" => "w1", "deleted" => true})

      assert {:ok, %MillionSend.Webhooks.Webhook{deleted: true}} =
               MillionSend.Webhooks.remove(c, "w1")

      assert req_method() == :delete and req_path() == "/webhooks/w1"
    end

    test "rotate posts an empty object by default, or the given options", %{client: c} do
      stub_json(%{
        "object" => "webhook",
        "id" => "w1",
        "signing_secret" => "whsec_new",
        "previous_secret_expires_at" => "2026-01-02T00:00:00.000Z"
      })

      assert {:ok,
              %MillionSend.Webhooks.Webhook{
                id: "w1",
                signing_secret: "whsec_new",
                previous_secret_expires_at: "2026-01-02T00:00:00.000Z"
              }} = MillionSend.Webhooks.rotate(c, "w1")

      assert req_method() == :post and req_path() == "/webhooks/w1/rotate"
      assert req_headers()["content-type"] == "application/json"
      assert req_body() == %{}

      assert {:ok, _} =
               MillionSend.Webhooks.rotate(c, "w1",
                 signing_secret: "whsec_mine",
                 overlap_hours: 0
               )

      assert req_body() == %{"signing_secret" => "whsec_mine", "overlap_hours" => 0}
    end
  end

  describe "templates" do
    test "create/list/get/update/remove/publish/duplicate", %{client: c} do
      assert {:ok, _} =
               MillionSend.Templates.create(c, %{
                 name: "Welcome",
                 html: "<p>Hi</p>",
                 subject: "Welcome!",
                 text: "Hi",
                 alias: "welcome"
               })

      assert req_method() == :post and req_path() == "/templates"

      assert req_body() == %{
               "name" => "Welcome",
               "html" => "<p>Hi</p>",
               "subject" => "Welcome!",
               "text" => "Hi",
               "alias" => "welcome"
             }

      assert {:ok, %MillionSend.List{}} = MillionSend.Templates.list(c, limit: 3)
      assert req_method() == :get and req_path() == "/templates"
      assert req_query() == "limit=3"

      stub_json(%{
        "object" => "template",
        "id" => "t1",
        "alias" => "welcome",
        "html" => "<p>Hi</p>",
        "current_version_id" => "v1",
        "has_unpublished_versions" => false
      })

      assert {:ok, %MillionSend.Templates.Template{alias: "welcome", current_version_id: "v1"}} =
               MillionSend.Templates.get(c, "welcome")

      assert req_method() == :get and req_path() == "/templates/welcome"

      assert {:ok, _} =
               MillionSend.Templates.update(c, "t1", %{alias: nil, subject: nil, text: nil})

      assert req_method() == :patch and req_path() == "/templates/t1"
      assert req_body() == %{"alias" => nil, "subject" => nil, "text" => nil}

      stub_json(%{"object" => "template", "id" => "t1", "deleted" => true})

      assert {:ok, %MillionSend.Templates.Template{deleted: true}} =
               MillionSend.Templates.remove(c, "t1")

      assert req_method() == :delete and req_path() == "/templates/t1"

      assert {:ok, _} = MillionSend.Templates.publish(c, "t1")
      assert req_method() == :post and req_path() == "/templates/t1/publish"
      assert req_body() == nil

      stub_json(%{"object" => "template", "id" => "t2"})

      assert {:ok, %MillionSend.Templates.Template{id: "t2"}} =
               MillionSend.Templates.duplicate(c, "t1")

      assert req_method() == :post and req_path() == "/templates/t1/duplicate"
    end
  end

  describe "contact properties" do
    test "create/list/get/update/remove", %{client: c} do
      stub_json(%{
        "object" => "contact_property",
        "id" => "p1",
        "key" => "plan",
        "type" => "string",
        "fallback_value" => "free"
      })

      assert {:ok, %MillionSend.ContactProperties.ContactProperty{key: "plan", type: "string"}} =
               MillionSend.ContactProperties.create(c, %{
                 key: "plan",
                 type: :string,
                 fallback_value: "free"
               })

      assert req_method() == :post and req_path() == "/contact-properties"
      assert req_body() == %{"key" => "plan", "type" => "string", "fallback_value" => "free"}

      assert {:ok, %MillionSend.List{}} = MillionSend.ContactProperties.list(c, before: "p0")
      assert req_method() == :get and req_path() == "/contact-properties"
      assert req_query() == "before=p0"

      assert {:ok, _} = MillionSend.ContactProperties.get(c, "p1")
      assert req_method() == :get and req_path() == "/contact-properties/p1"

      assert {:ok, _} = MillionSend.ContactProperties.update(c, "p1", %{fallback_value: nil})
      assert req_method() == :patch and req_path() == "/contact-properties/p1"
      assert req_body() == %{"fallback_value" => nil}

      stub_json(%{"object" => "contact_property", "id" => "p1", "deleted" => true})

      assert {:ok, %MillionSend.ContactProperties.ContactProperty{deleted: true}} =
               MillionSend.ContactProperties.remove(c, "p1")

      assert req_method() == :delete and req_path() == "/contact-properties/p1"
    end
  end

  describe "usage" do
    test "get casts the report", %{client: c} do
      stub_json(%{
        "object" => "usage",
        "cloud" => true,
        "plan" => "pro",
        "limits" => %{"emails_per_day" => 50_000, "domains" => 10},
        "today" => %{"emails_sent" => 1_234, "resets_at" => "2026-09-05T00:00:00.000Z"},
        "team" => %{"id" => "team-1", "name" => "Acme"},
        "app_url" => "https://app.millionsend.com"
      })

      assert {:ok, %MillionSend.Usage{} = usage} = MillionSend.Usage.get(c)
      assert req_method() == :get and req_path() == "/usage"
      assert usage.cloud == true and usage.plan == "pro"
      assert usage.limits == %{"emails_per_day" => 50_000, "domains" => 10}
      assert usage.today["emails_sent"] == 1_234
      assert usage.team["name"] == "Acme"

      stub_json(%{
        "object" => "usage",
        "cloud" => false,
        "plan" => nil,
        "limits" => %{"emails_per_day" => nil, "domains" => nil},
        "today" => %{"emails_sent" => 0, "resets_at" => "2026-09-05T00:00:00.000Z"},
        "team" => %{"id" => "team-1", "name" => "Acme"},
        "app_url" => nil
      })

      assert {:ok, %MillionSend.Usage{plan: nil, app_url: nil}} = MillionSend.Usage.get(c)
    end
  end

  describe "casting" do
    test "list envelope casts items and carries has_more", %{client: c} do
      stub_json(%{
        "object" => "list",
        "has_more" => true,
        "data" => [%{"id" => "s1", "name" => "Active", "created_at" => "2026-01-01"}]
      })

      assert {:ok, list} = MillionSend.Segments.list(c)
      assert list.has_more == true
      assert [%MillionSend.Segments.Segment{id: "s1", name: "Active"}] = list.data
    end

    test "delete response casts deleted flag", %{client: c} do
      stub_json(%{"object" => "segment", "id" => "s1", "deleted" => true})

      assert {:ok, %MillionSend.Segments.Segment{deleted: true, id: "s1"}} =
               MillionSend.Segments.remove(c, "s1")
    end
  end
end

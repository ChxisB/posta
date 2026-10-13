package millionsend

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestE2EContactLifecycle exercises the team-global contact lifecycle against
// a real MillionSend instance. It runs only when MILLIONSEND_API_KEY is set
// (and MILLIONSEND_BASE_URL for a self-hosted instance); otherwise it skips. No
// verified sender domain is required.
func TestE2EContactLifecycle(t *testing.T) {
	if os.Getenv("MILLIONSEND_API_KEY") == "" {
		t.Skip("set MILLIONSEND_API_KEY to run the e2e test")
	}
	c := NewClient("") // reads key + base URL from the environment

	email := fmt.Sprintf("sdk-e2e-%d@example.com", time.Now().UnixNano())
	created, err := c.Contacts.Create(&CreateContactRequest{Email: email, FirstName: "Ada"})
	require.NoError(t, err)
	require.NotEmpty(t, created.Id)

	got, err := c.Contacts.Get(ContactAddress{Email: email})
	require.NoError(t, err)
	assert.Equal(t, email, got.Email)
	assert.Equal(t, "Ada", got.FirstName)

	// Duplicate email (case-insensitive per team) is a 409 validation_error.
	_, err = c.Contacts.Create(&CreateContactRequest{Email: email})
	require.Error(t, err)
	var dup *MillionSendError
	require.ErrorAs(t, err, &dup)
	assert.Equal(t, 409, dup.StatusCode)

	_, err = c.Contacts.Update(&UpdateContactRequest{Email: email, Unsubscribed: Ptr(true)})
	require.NoError(t, err)

	removed, err := c.Contacts.Remove(ContactAddress{Email: email})
	require.NoError(t, err)
	assert.True(t, removed.Deleted)

	// A missing contact surfaces as a typed error, never a panic.
	_, err = c.Contacts.Get(ContactAddress{Email: "does-not-exist@example.com"})
	require.Error(t, err)
	var mse *MillionSendError
	require.ErrorAs(t, err, &mse)
	assert.Equal(t, "not_found", mse.Name)
}

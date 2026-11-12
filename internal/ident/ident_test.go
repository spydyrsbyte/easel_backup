package ident

import "testing"

func TestValid(t *testing.T) {
	for _, test := range []struct {
		name  string
		valid bool
	}{
		{"a", true},
		{"_x", true},
		{"easel.a.b-c_9", true},
		{"", false},
		{"9a", false},
		{"a b", false},
		{"a/b", false},
		{"$a", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := Valid(test.name); got != test.valid {
				t.Fatalf("Valid(%q) = %v, want %v", test.name, got, test.valid)
			}
		})
	}
}

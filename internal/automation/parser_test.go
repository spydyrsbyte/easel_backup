package automation

import (
	"reflect"
	"strings"
	"testing"
)

func TestParseDefinitions(t *testing.T) {
	source := "d:add a b\nlet sum {\"expr\":\"add\",\"args\":[{\"var\":\"a\"},{\"var\":\"b\"}]}\nreturn $sum\n\nd:greet name\nevent joined\ne:greeted {\"text\":\"hi\"}\n"
	definitions, err := Parse(source)
	if err != nil {
		t.Fatal(err)
	}
	if len(definitions) != 2 {
		t.Fatalf("definitions: %d", len(definitions))
	}
	add := definitions[0]
	if add.Name != "add" || !reflect.DeepEqual(add.Parameters, []string{"a", "b"}) || len(add.Steps) != 2 {
		t.Fatalf("add: %+v", add)
	}
	if add.Steps[0].Op != "let" || add.Steps[0].Name != "sum" || add.Steps[1].Op != "return" {
		t.Fatalf("add steps: %+v", add.Steps)
	}
	if !reflect.DeepEqual(add.Steps[1].Value, map[string]any{"var": "sum"}) {
		t.Fatalf("return value: %#v", add.Steps[1].Value)
	}
	greet := definitions[1]
	if greet.Event != "joined" || len(greet.Steps) != 1 || greet.Steps[0].Op != "emit" || greet.Steps[0].Name != "greeted" {
		t.Fatalf("greet: %+v", greet)
	}
}

func TestParseErrors(t *testing.T) {
	for name, test := range map[string]struct {
		source string
		want   string
	}{
		"missing definition": {"let x 1", "expected d:name"},
		"unmatched endblock": {"d:a\nendblock", "unmatched endblock"},
		"duplicate":          {"d:a\nreturn 1\nd:a\nreturn 2", "duplicate definition"},
		"unknown":            {"d:a\nfrobnicate 1", "unknown instruction"},
		"missing endblock":   {"d:a\nblock\nreturn 1", "missing endblock"},
		"empty":              {"", "no automation definitions"},
		"unterminated":       {"d:a\nlet x [1", "unterminated"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := Parse(test.source)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want %q", err, test.want)
			}
		})
	}
}

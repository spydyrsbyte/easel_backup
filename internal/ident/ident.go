package ident

import (
	"regexp"
	"strings"
)

var pattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]*$`)

func Valid(name string) bool { return pattern.MatchString(name) }

var javaScript = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)

var reservedWords = map[string]bool{"break": true, "case": true, "catch": true, "class": true, "const": true, "continue": true, "debugger": true, "default": true, "delete": true, "do": true, "else": true, "enum": true, "export": true, "extends": true, "false": true, "finally": true, "for": true, "function": true, "if": true, "import": true, "in": true, "instanceof": true, "new": true, "null": true, "return": true, "super": true, "switch": true, "this": true, "throw": true, "true": true, "try": true, "typeof": true, "var": true, "void": true, "while": true, "with": true, "yield": true, "let": true, "static": true, "implements": true, "interface": true, "package": true, "private": true, "protected": true, "public": true, "await": true}

func JavaScript(name string) bool { return javaScript.MatchString(name) && !reservedWords[name] }

func Segment(name string) bool {
	return JavaScript(name) && name != "__proto__" && name != "prototype" && name != "constructor"
}

func Qualified(name string) bool {
	parts := strings.Split(name, ".")
	return len(parts) == 3 && Segment(parts[0]) && Segment(parts[1]) && Segment(parts[2])
}

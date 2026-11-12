package automation

import (
	"bufio"
	"context"
	"fmt"
	"strings"
	"unicode"

	"easel/internal/ident"
)

func tokens(line string) ([]string, error) {
	result := []string{}
	start := -1
	quoted, escaped := false, false
	stack := []rune{}
	for index, character := range line {
		if start < 0 {
			if unicode.IsSpace(character) {
				continue
			}
			if character == '#' {
				break
			}
			start = index
		}
		if quoted {
			if escaped {
				escaped = false
			} else if character == '\\' {
				escaped = true
			} else if character == '"' {
				quoted = false
			}
			continue
		}
		if character == '"' {
			quoted = true
			continue
		}
		switch character {
		case '[', '{':
			stack = append(stack, character)
		case ']', '}':
			if len(stack) == 0 {
				return nil, fmt.Errorf("unmatched closing bracket")
			}
			opening := stack[len(stack)-1]
			if (character == ']' && opening != '[') || (character == '}' && opening != '{') {
				return nil, fmt.Errorf("mismatched brackets")
			}
			stack = stack[:len(stack)-1]
		}
		if unicode.IsSpace(character) && len(stack) == 0 {
			result = append(result, line[start:index])
			start = -1
		}
	}
	if quoted || len(stack) != 0 {
		return nil, fmt.Errorf("unterminated string or collection")
	}
	if start >= 0 {
		result = append(result, line[start:])
	}
	return result, nil
}

func tokenValue(token string) (any, error) {
	if strings.HasPrefix(token, "$") {
		parts := strings.Split(strings.TrimPrefix(token, "$"), ".")
		if parts[0] == "" {
			return nil, fmt.Errorf("empty variable reference")
		}
		if len(parts) == 1 {
			return map[string]any{"var": parts[0]}, nil
		}
		path := make([]any, len(parts))
		for index, part := range parts {
			path[index] = part
		}
		return map[string]any{"path": path}, nil
	}
	return literalToken(token)
}

func literalToken(token string) (any, error) {
	value, err := decodeValue(token)
	if err == nil {
		return value, nil
	}
	if strings.HasPrefix(token, "\"") || strings.HasPrefix(token, "[") || strings.HasPrefix(token, "{") {
		return nil, err
	}
	return token, nil
}

type sourceLine struct {
	number int
	tokens []string
}

func Parse(source string) ([]Definition, error) {
	lines := []sourceLine{}
	scanner := bufio.NewScanner(strings.NewReader(source))
	scanner.Buffer(make([]byte, 4096), maxSourceLineBytes)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		parts, err := tokens(scanner.Text())
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNumber, err)
		}
		if len(parts) > 0 {
			lines = append(lines, sourceLine{lineNumber, parts})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	definitions := []Definition{}
	seen := map[string]bool{}
	for cursor := 0; cursor < len(lines); {
		line := lines[cursor]
		if !strings.HasPrefix(line.tokens[0], "d:") {
			return nil, fmt.Errorf("line %d: expected d:name", line.number)
		}
		definition := Definition{Name: strings.TrimPrefix(line.tokens[0], "d:"), Parameters: line.tokens[1:]}
		cursor++
		if seen[definition.Name] {
			return nil, fmt.Errorf("duplicate definition %q", definition.Name)
		}
		seen[definition.Name] = true
		if cursor < len(lines) && lines[cursor].tokens[0] == "event" {
			if len(lines[cursor].tokens) != 2 {
				return nil, fmt.Errorf("event requires a name")
			}
			definition.Event = lines[cursor].tokens[1]
			cursor++
		}
		steps, err := parseSteps(lines, &cursor, false)
		if err != nil {
			return nil, err
		}
		definition.Steps = steps
		if err := Validate(definition); err != nil {
			return nil, err
		}
		definitions = append(definitions, definition)
	}
	if len(definitions) == 0 {
		return nil, fmt.Errorf("no automation definitions")
	}
	return definitions, nil
}

func parseSteps(lines []sourceLine, cursor *int, nested bool) ([]Step, error) {
	steps := []Step{}
	for *cursor < len(lines) {
		line := lines[*cursor]
		parts := line.tokens
		op := parts[0]
		if strings.HasPrefix(op, "d:") {
			if nested {
				return nil, fmt.Errorf("line %d: block must end before next definition", line.number)
			}
			return steps, nil
		}
		*cursor++
		if op == "endblock" {
			if !nested {
				return nil, fmt.Errorf("line %d: unmatched endblock", line.number)
			}
			return steps, nil
		}
		step, err := parseInstruction(parts)
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", line.number, err)
		}
		if step.Op == "block" || step.Op == "each" {
			step.Steps, err = parseSteps(lines, cursor, true)
			if err != nil {
				return nil, err
			}
		}
		steps = append(steps, step)
	}
	if nested {
		return nil, fmt.Errorf("missing endblock")
	}
	return steps, nil
}

func parseInstruction(parts []string) (Step, error) {
	op := parts[0]
	args := parts[1:]
	step := Step{Op: op}
	require := func(count int) error {
		if len(args) != count {
			return fmt.Errorf("%s expects %d arguments", op, count)
		}
		return nil
	}
	value := func(index int) (any, error) { return tokenValue(args[index]) }
	var err error
	if (strings.HasPrefix(op, ".") || op == "call") && len(args) >= 2 && args[len(args)-2] == "->" {
		step.As = strings.TrimPrefix(args[len(args)-1], "$")
		if !ident.Valid(step.As) {
			return step, fmt.Errorf("invalid result variable")
		}
		args = args[:len(args)-2]
	}
	if strings.HasPrefix(op, ".") {
		step.Op = "call"
		step.Name = strings.TrimPrefix(op, ".")
		for _, arg := range args {
			parsed, err := tokenValue(arg)
			if err != nil {
				return step, err
			}
			step.Args = append(step.Args, parsed)
		}
		return step, nil
	}
	if strings.HasPrefix(op, "e:") {
		step.Op = "emit"
		step.Name = strings.TrimPrefix(op, "e:")
		if err := require(1); err != nil {
			return step, err
		}
		step.Value, err = value(0)
		return step, err
	}
	switch op {
	case "fields":
		if len(args) == 0 {
			return step, fmt.Errorf("fields requires names")
		}
		step.Names = args
	case "load":
		if err := require(3); err != nil {
			return step, err
		}
		step.Type = args[0]
		step.ID, err = value(1)
		step.As = args[2]
	case "save":
		if err := require(1); err != nil {
			return step, err
		}
		step.Record = strings.TrimPrefix(args[0], "$")
	case "delta", "multiply", "set", "append", "remove":
		if err := require(2); err != nil {
			return step, err
		}
		step.Target, err = value(0)
		if err == nil {
			step.Value, err = value(1)
		}
	case "let":
		if err := require(2); err != nil {
			return step, err
		}
		step.Name = strings.TrimPrefix(args[0], "$")
		step.Value, err = value(1)
	case "compare":
		if err := require(3); err != nil {
			return step, err
		}
		operators := map[string]string{"==": "equals", "!=": "notEquals", "<": "lessThan", "<=": "lessOrEqual", ">": "greaterThan", ">=": "greaterOrEqual"}
		operator, found := operators[args[1]]
		if !found {
			return step, fmt.Errorf("unknown comparison %q", args[1])
		}
		left, err := value(0)
		if err != nil {
			return step, err
		}
		right, err := value(2)
		if err != nil {
			return step, err
		}
		step.Condition = map[string]any{"expr": operator, "args": []any{left, right}}
	case "block":
		err = require(0)
	case "each":
		if len(args) < 2 || len(args) > 3 {
			return step, fmt.Errorf("each expects list, item name, optional index name")
		}
		step.Value, err = value(0)
		step.Item = args[1]
		if len(args) == 3 {
			step.Index = args[2]
		}
	case "return":
		if len(args) > 1 {
			return step, fmt.Errorf("return expects zero or one argument")
		}
		if len(args) == 1 {
			step.Value, err = value(0)
		}
	case "call":
		if len(args) < 1 {
			return step, fmt.Errorf("call requires automation name")
		}
		step.Name = args[0]
		for _, arg := range args[1:] {
			parsed, err := tokenValue(arg)
			if err != nil {
				return step, err
			}
			step.Args = append(step.Args, parsed)
		}
	default:
		return step, fmt.Errorf("unknown instruction %q", op)
	}
	return step, err
}

func (service *Service) Command(ctx context.Context, command string) (Result, error) {
	parts, err := tokens(command)
	if err != nil {
		return Result{}, err
	}
	if len(parts) == 0 || !strings.HasPrefix(parts[0], ".") {
		return Result{}, fmt.Errorf("expected .automationName arguments")
	}
	args := make([]any, 0, len(parts)-1)
	for _, token := range parts[1:] {
		value, err := literalToken(token)
		if err != nil {
			return Result{}, err
		}
		args = append(args, value)
	}
	return service.Run(ctx, strings.TrimPrefix(parts[0], "."), args)
}

package automation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

func Decode(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing data after JSON value")
	}
	return nil
}

func clone(value any) (any, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return decodeValue(string(data))
}

func decodeValue(text string) (any, error) {
	var value any
	if err := Decode([]byte(text), &value); err != nil {
		return nil, err
	}
	return value, nil
}

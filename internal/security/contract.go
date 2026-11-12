package security

import "fmt"

type BuildContract struct {
	Types map[string]bool
}

func (c *BuildContract) Type(name string) error {
	if !c.Types[name] {
		return fmt.Errorf("unregistered type %q", name)
	}
	return nil
}

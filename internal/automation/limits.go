package automation

const (
	defaultMaxSteps     = 100000
	defaultMaxCallDepth = 64
	maxNestingDepth     = 64
	maxSourceLineBytes  = 1024 * 1024
)

func (service *Service) maxSteps() int {
	if service.MaxSteps > 0 {
		return service.MaxSteps
	}
	return defaultMaxSteps
}

func (service *Service) maxCallDepth() int {
	if service.MaxCallDepth > 0 {
		return service.MaxCallDepth
	}
	return defaultMaxCallDepth
}

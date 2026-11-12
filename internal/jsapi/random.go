package jsapi

import (
	"crypto/rand"
	"fmt"
	"math"
	"math/big"

	"github.com/grafana/sobek"
)

func (bridge *EventBridge) installRandom(easel *sobek.Object) error {
	random := bridge.vm.NewObject()
	integer := func(min, max int64) int64 {
		value, err := rand.Int(rand.Reader, big.NewInt(max-min))
		if err != nil {
			bridge.fail(fmt.Errorf("server randomness: %w", err))
		}
		return min + value.Int64()
	}
	if err := random.Set("integer", func(call sobek.FunctionCall) sobek.Value {
		bounds := [2]int64{}
		for index := range bounds {
			value := call.Argument(index)
			switch value.Export().(type) {
			case int64, float64:
			default:
				bridge.fail(fmt.Errorf("random bounds must be integers"))
			}
			number := value.ToFloat()
			if math.IsNaN(number) || math.IsInf(number, 0) || number != math.Trunc(number) || math.Abs(number) > 9007199254740991 {
				bridge.fail(fmt.Errorf("random bounds must be safe integers"))
			}
			bounds[index] = int64(number)
		}
		if bounds[1] <= bounds[0] || bounds[1]-bounds[0] > 9007199254740991 {
			bridge.fail(fmt.Errorf("random range must be nonempty and safely representable"))
		}
		return bridge.vm.ToValue(integer(bounds[0], bounds[1]))
	}); err != nil {
		return err
	}
	if err := random.Set("fraction", func() float64 {
		return float64(integer(0, 1<<53)) / (1 << 53)
	}); err != nil {
		return err
	}
	freeze, _ := sobek.AssertFunction(bridge.vm.Get("Object").ToObject(bridge.vm).Get("freeze"))
	if _, err := freeze(sobek.Undefined(), random); err != nil {
		return err
	}
	return easel.DefineDataProperty("Random", random, sobek.FLAG_FALSE, sobek.FLAG_FALSE, sobek.FLAG_TRUE)
}

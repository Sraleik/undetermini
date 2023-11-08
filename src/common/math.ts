export function cartesianProduct(arrays: any[][]): any[][] {
  // Base case: if there are no arrays or any of them is empty, return an empty array
  if (arrays.length === 0 || arrays.some((array) => array.length === 0)) {
    return [];
  }

  // Recursive case
  function cartesianHelper(arrays: any[][], index: number): any[][] {
    // If we've processed all arrays, return an array containing an empty tuple
    if (index === arrays.length) {
      return [[]];
    }

    // Compute the Cartesian product of the remaining arrays
    const remainingProduct = cartesianHelper(arrays, index + 1);

    // Prepend each element of the current array to each tuple of the remaining product
    const result: any[][] = [];
    for (const item of arrays[index]) {
      for (const tuple of remainingProduct) {
        result.push([item, ...tuple]);
      }
    }

    return result;
  }

  return cartesianHelper(arrays, 0);
}

export function generateAllPossibleOrders(arr: any[]): any[][] {
  if (arr.length === 1) return [arr];
  const result: string[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const first = arr[i];
    const leftovers = arr.slice(0, i).concat(arr.slice(i + 1));
    const innerPermutations = generateAllPossibleOrders(leftovers);
    for (let j = 0; j < innerPermutations.length; j++) {
      result.push([first].concat(innerPermutations[j]));
    }
  }
  return result;
}

export function generatePartialPossibilities(arr: any[]): any[][] {
  const result: any[][] = [];
  const f = (prefix, arr) => {
    for (let i = 0; i < arr.length; i++) {
      result.push([...prefix, arr[i]]);
      f([...prefix, arr[i]], arr.slice(i + 1));
    }
  };
  f([], arr);
  return result.filter((possibility) => possibility.length < arr.length);
}

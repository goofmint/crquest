const houses = [
  { name: 'hopper', id: 1, magicScore: 0 },
  { name: 'lovelace', id: 2, magicScore: 0 },
  { name: 'turing', id: 3, magicScore: -1 },
  { name: 'neumann', id: 4, magicScore: -2 }
]

let finalResults = [];
const determineHouse = () => {

  const bestScore = Math.min(...houses.map(house => house.magicScore))
  const bestHouses = houses.filter(house => house.magicScore == bestScore);
  const randomBestNum = Math.floor(Math.random() * bestHouses.length);
  const bestHouse = bestHouses[randomBestNum]


  // console.log({
  //   "highest house": highestHouseId,
  //   "random house id": randomHouseId,
  //   "calculated id": houseId,
  //   "calculated house name": houses.find(house=>house.id==Math.floor(houseId)).name
  // });

  finalResults.push(houses.find(house=>house.id==bestHouse.id).name)
}

const assignRandomMagicScore = () => {
  for (house of houses) {
    house.magicScore = Math.floor(Math.random() * 2);
  }
}

for (i=0; i<200; i++) {
  assignRandomMagicScore();
  determineHouse();
}

console.log({
  turing: finalResults.filter(house => house == 'turing').length,
  lovelace: finalResults.filter(house => house == 'lovelace').length,
  hopper: finalResults.filter(house => house == 'hopper').length,
  neumann: finalResults.filter(house => house == 'neumann').length,
})

const { dbPromise, initDB } = require('./database');

const traits = [
  "will you go to this senior for fashion advice",
  "will you go to this senior for pointers to pull baddies",
  "will you go to this senior for gossip/tea",
  "will you go to this senior for tutoring",
  "will you go to this senior to bail you out of jail (metaphorically)",
  "will you go to this senior for partying",
  "will you go to this senior for consolation after heartbreak",
  "will you go to this senior for deep conversations",
  "will you go to this senior to put one psych scene"
];

async function seed() {
  const db = await initDB();

  // Clear existing data for fresh seed
  await db.exec('DELETE FROM traits');
  await db.exec('DELETE FROM sqlite_sequence WHERE name="traits"');
  await db.exec('DELETE FROM seniors');
  await db.exec('DELETE FROM sqlite_sequence WHERE name="seniors"');
  await db.exec('DELETE FROM pair_stats');

  console.log('Seeding traits...');
  for (const text of traits) {
    await db.run('INSERT INTO traits (question_text) VALUES (?)', [text]);
  }

  console.log('Seeding real seniors...');

  // You can fill in the actual names, roles, and filenames for all 7 people here!
  const myRealSeniors = [
    { name: "Sarah", alias: "Role 1", image: "person1.png.JPG" },
    { name: "Varsith", alias: "Role 2", image: "person2.png.JPG" },
    { name: "Aditya", alias: "Role 3", image: "person3.png.JPG" },
    { name: "Reenu", alias: "Role 4", image: "person4.png.JPG" },
    { name: "Shashank", alias: "Role 5", image: "person5.png.JPG" },
    { name: "Humaidh", alias: "Role 6", image: "person6.png.JPG" },
    { name: "Akhyan", alias: "Role 7", image: "person7.png.JPG" }
  ];

  for (const person of myRealSeniors) {
    await db.run(
      'INSERT INTO seniors (name, alias, caricature_id) VALUES (?, ?, ?)',
      [person.name, person.alias, person.image]
    );
  }

  console.log('Pre-populating pair_stats...');
  const seniorRows = await db.all('SELECT id FROM seniors');
  const traitRows = await db.all('SELECT id FROM traits');

  const insertStat = await db.prepare('INSERT INTO pair_stats (senior_id, trait_id) VALUES (?, ?)');
  for (const s of seniorRows) {
    for (const t of traitRows) {
      await insertStat.run([s.id, t.id]);
    }
  }
  await insertStat.finalize();

  console.log('Database seeded successfully!');
  await db.close();
}

seed().catch(console.error);
